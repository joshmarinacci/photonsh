#!/usr/bin/env node
var readline = require('readline');
var fs = require('fs');
var hu = require('humanize');
var ansi = require('ansi');
var path = require('path');
var AsciiTable = require('ascii-table');

var cwd = process.cwd();
var basecwd = cwd;
var prompt = "Sup?▶ ";

var completions = [];
function completer(line) {
    var m = line.match(/^(\w+)\s+(.*)/);
    if(m) {
        var cmd = m[1];
        var rest = m[2];
        var hits = listDir(cwd)
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

function listDir(dir) {
    return fs.readdirSync(dir)
        .filter(function(file) {
            return file.indexOf('.')!=0;
        });
}

var rl = readline.createInterface({
   input: process.stdin,
   output: process.stdout,
   completer:completer,
});
var cursor = ansi(rl.output);

var commands = {
    ls:function() {
        var files = listDir(cwd).map(function(file) {
            return {name:file, stats:fs.statSync(cwd+'/'+file)};
        });
        var table = new AsciiTable()
        table
            .removeBorder()
            .setAlign(0,AsciiTable.LEFT)
            .setAlign(1,AsciiTable.RIGHT)
            .setAlign(2,AsciiTable.LEFT)
            .setHeading("name",'size','date');

        files.forEach(function(file) {
            table.addRow(file.name,
                         hu.filesize(file.stats.size),
                         hu.date("Y M j H:m:s",new Date(file.stats.mtime)));
        });
        console.log(table.toString())
   },

   cd:function(file) {
       var ncwd = path.join(cwd,file);
       if(!fs.existsSync(ncwd))
           return fileError("No such directory: ",file);
       if(!fs.statSync(ncwd).isDirectory())
           return fileError("Not a directory: ",file);
       cwd = ncwd;
       updatePrompt();
   },

   more: function(filename) {
       var file = path.join(cwd,filename);
       if(!fs.existsSync(file))
           return fileError("No such file: ",file);
       if(!fs.statSync(file).isFile())
           return fileError("Not a file: ",file);
       var inp = fs.createReadStream(file);
       inp.pipe(rl.output);
   },

   cp: function(a,b) {
       if(!fs.existsSync(a))
           return fileError("No such file: ",a);
       if(!fs.statSync(a).isFile())
           return fileError("Not a file: ",a);
       var ip = fs.createReadStream(path.join(cwd,a));
       var op = fs.createWriteStream(path.join(cwd,b));
       ip.pipe(op);
   },

   rm: function(file) {
       fs.unlinkSync(path.join(cwd,file));
   },

   rmdir: function(dir) {
       fs.rmdirSync(path.join(cwd,dir));
   },

   mkdir: function(dir) {
       fs.mkdirSync(path.join(cwd,dir));
   },

   mv: function(a,b) {
       fs.renameSync(path.join(cwd,a),path.join(cwd,b));
   },

   pwd: function() {
       cursor.green().write(cwd).reset().write('\n');
   },

   help: function() {
       cursor.yellow().write("Welcome to Photon Shell\n");
       cursor.white().write("you can use the following commands\n");
       cursor.green().write(Object.keys(commands).sort().join("\n"));
       cursor.reset();
   }
}

commands['dir'] = commands['ls'];

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

rl.on('line', function(cmd) {
    console.log("");
    var cmds = cmd.trim().split(' ');
    cursor.cyan().write("DEBUG = " + cmds.join(",")).reset().write('\n\n');
    var bin = cmds[0];
    var args = cmds.slice(1);
    if(commands[bin]) {
        executeCommand(commands[bin],args);
    } else {
        cursor.red().write("Unknown command: ").green().write(bin).reset().write('\n');
    }
    console.log("");
    rl.prompt();
});

rl.on('close', function() {
   console.log("");
   console.log("Later Dude!");
})

updatePrompt();
rl.prompt();
