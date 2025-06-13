#!/usr/bin/env node
import readline from 'node:readline'
import fs from 'node:fs'
import hu from 'humanize'
import process from 'node:process'
import ansi from 'ansi'
import path from 'node:path'
import es from 'event-stream'
import AsciiTable from 'ascii-table'
import clc from 'cli-color'
// import split from 'split'
import child_process from "node:child_process"

let cwd = process.cwd();
const basecwd = cwd;
const prompt = "Sup?▶ ";

let completions = [];

function completer(line) {
    const m = line.match(/^(\w+)\s+(.*)/);
    if(m) {
        const cmd = m[1];
        const rest = m[2];
        let hits = listDir(cwd)
            .filter(function(c) { return c.indexOf(rest) == 0 })
            .map(function(s){  return cmd+' '+s; });
        return [hits, line];
    }

    var hits = completions.filter(function(c) { return c.indexOf(line) == 0 })
    return [hits.length ? hits : completions, line]
}

function fileError(msg,file) {
    cursor
        .red().write(msg)
        .green().write(file)
        .reset().write("\n");
}

//list directory, skipping hidden files
function listDir(dir) {
    return fs.readdirSync(dir)
        .filter(function(file) {
            return file.indexOf('.')!=0;
        });
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: completer,
});
let cursor = ansi(rl.output);

function Pager(inp) {
    const self = this;
    this.count = 0;
    this.active = true;
    inp
        .pipe(es.split())
        .pipe(es.through(function(data){
            self.filter = this;
            self.count++;
            if(self.count %10 == 0) {
                self.filter.pause();
                console.log("==== more");
            } else {
                console.log(data);
            }
        },function end(){
            self.cleanup();
        }));
    this.cleanup = function() {
        this.active = false;
        rl.line = '';
        rl.prompt();
    }
    this.resume = function() {
        this.filter.resume();
    }
    this.keypress = function(k) {
        if(k=='q') {
            this.cleanup();
        }
        if(k==' ') {
            this.resume();
        }
    }
}

let pager = null;

const commands = {
    ls: function () {
        const files = listDir(cwd).map(function (file) {
            return {name: file, stats: fs.statSync(cwd + '/' + file)};
        });
        const table = new AsciiTable();
        table
            .removeBorder()
            .setAlign(0, AsciiTable.LEFT)
            .setAlign(1, AsciiTable.RIGHT)
            .setAlign(2, AsciiTable.LEFT)
        //.setHeading("name",'size','date');

        files.forEach(function (file) {
            table.addRow(clc.red(file.name),
                clc.green(hu.filesize(file.stats.size)),
                clc.blue(hu.date("Y M j H:m:s", new Date(file.stats.mtime))));
        });
        console.log(table.toString())
    },

    cd: function (file) {
        const ncwd = path.join(cwd, file);
        if (!fs.existsSync(ncwd))
            return fileError("No such directory: ", file);
        if (!fs.statSync(ncwd).isDirectory())
            return fileError("Not a directory: ", file);
        cwd = ncwd;
        updatePrompt();
    },

    exit: function () {
        process.exit(0);
    },

    more: function (filename) {
        const file = path.join(cwd, filename);
        if (!fs.existsSync(file)) return fileError("No such file: ", file);
        if (!fs.statSync(file).isFile()) return fileError("Not a file: ", file);
        const inp = fs.createReadStream(file);
        pager = new Pager(inp);
    },

    cp: function (a, b) {
        if (!fs.existsSync(a)) return fileError("No such file: ", a);
        if (!fs.statSync(a).isFile()) return fileError("Not a file: ", a);
        const ip = fs.createReadStream(path.join(cwd, a));
        const op = fs.createWriteStream(path.join(cwd, b));
        ip.pipe(op);
    },

    rm: function (file) {
        fs.unlinkSync(path.join(cwd, file));
    },

    rmdir: function (dir) {
        fs.rmdirSync(path.join(cwd, dir));
    },

    mkdir: function (dir) {
        fs.mkdirSync(path.join(cwd, dir));
    },

    mv: function (a, b) {
        fs.renameSync(path.join(cwd, a), path.join(cwd, b));
    },

    pwd: function () {
        cursor.green().write(cwd).reset().write('\n');
    },

    help: function () {
        cursor.yellow().write("Welcome to Photon Shell\n");
        cursor.red().write('  bugs to: joshua@marinacci.org\n\n');
        cursor.black().write("A simple 100% Node command line shell in < 300 lines.\n")
        cursor.black().write("You can use the following commands, or regular binaries like 'git'\n\n");
        cursor.green().write(Object.keys(commands).sort().join("\n"));
        cursor.write('\n\n');
        cursor.reset();
    },

};

commands['dir'] = commands['ls'];
commands['quit'] = commands['exit'];

completions = Object.keys(commands).sort();


function updatePrompt() {
   rl.setPrompt('~/'+path.relative(basecwd,cwd) + " " + prompt);
}

function executeCommand(fn, args) {
   try {
       fn.apply(null,args);
   } catch(e) {
       console.log(e);
   }
}

rl.input.on('keypress',function(k) {
    if(pager && pager.active && k) {
        pager.keypress(k);
    }
});

function executeNativeCommand(bin, args, cb) {
    //console.log('trying to invoke native command ',bin,args);
    const ch = child_process.spawn(bin, args, {
        cwd: cwd,
        env: process.env,
        stdio: 'inherit'
    });
    ch.on('exit',function() {
        //console.log("process is exited");
        if(cb) cb();
    });
    ch.on('error',function(err) {
        console.log("error",err);
        cursor.red().write("Unknown command: ").green().write(bin).reset().write('\n');
        if(cb) cb();
    });
}

rl.on('line', function(cmd) {
    if(pager && pager.active) return;
    const cmds = cmd.trim().split(' ');
    cursor.cyan().write("DEBUG = " + cmds.join(",")).reset().write('\n\n');
    const bin = cmds[0];
    if(bin.length == 0) return rl.prompt();
    const args = cmds.slice(1);
    if(commands[bin]) {
        executeCommand(commands[bin],args);
    } else {
        executeNativeCommand(bin,args,function() {
            console.log("");
            rl.prompt();
        });
    }
    console.log("");
    rl.prompt();
});

rl.on('close', function() {
   console.log("");
   console.log("Later Dude!");
})


commands.help();
updatePrompt();
rl.prompt();
