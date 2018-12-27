"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var ffmpeg = require("fluent-ffmpeg");
var fs = require("fs-extra");
var process = require("process");
var path = require("path");
main();
function main() {
    var cwd = process.cwd();
    cwd = cwd + "\\sound\\";
    var prefix = cwd;
    var outdir = prefix + "\\out\\";
    var extname = ".mp3";
    var rate = 80;
    var reallen = 0;
    if (fs.existsSync(outdir)) {
        fs.removeSync(outdir);
        fs.mkdirSync(outdir);
    }
    var blank = prefix + "blank" + extname;
    if (fs.existsSync(blank)) {
        fs.removeSync(blank);
    }
    //创建空白区域
    var buffer = new Buffer(Math.round(rate * 1 * 1024));
    buffer.fill(0);
    var writeStream = fs.createWriteStream(blank, { flags: 'a' });
    writeStream.end(buffer);
    writeStream.on('close', function () {
        fs.readdir(prefix, function (err, files) {
            if (files) {
                var len = files.length;
                var fileArr = [];
                var audio = ffmpeg();
                audio.audioBitrate(rate);
                for (var i = 0; i < len; i++) {
                    var file = files[i];
                    var tmp = prefix + file;
                    var stat = fs.statSync(tmp);
                    if (stat.isFile()) {
                        var ext = path.extname(tmp);
                        var name_1 = file.substring(0, file.length - ext.length);
                        if (ext == extname && name_1 != "blank") {
                            audio = audio.input(tmp).input(blank);
                            fileArr.push({ name: name_1, url: tmp });
                        }
                    }
                }
                reallen = fileArr.length;
                for (var i = 0; i < reallen; i++) {
                    var obj = fileArr[i];
                    var url = obj.url, name_2 = obj.name;
                    ffmpeg.ffprobe(url, getCallBack(name_2, i));
                }
                audio.on("error", function (err) {
                    console.log('An error occurred: ' + err.message);
                }).on("end", function () {
                    console.log('Merging finished !');
                }).mergeToFile(outdir + "sound" + extname);
            }
        });
    });
    // let len = list.length;
    // let tmp = ffmpeg();
    // for (let i = 0; i < len; i++) {
    //     let key = list[i];
    //     let url = prefix + key + ".wav";
    //     tmp = tmp.input(url);
    //     ffmpeg.ffprobe(url, getCallBack(key, i));
    // }
    // tmp.on("error", function (err) {
    //     console.log('An error occurred: ' + err.message);
    // }).on("end", function () {
    //     console.log('Merging finished !');
    // }).mergeToFile(prefix + "merged.wav");
    var outobj = {};
    var arr = [];
    function getCallBack(filename, index) {
        return function (err, data) {
            if (data) {
                var obj = {};
                obj.name = filename;
                var file = data.streams[0];
                obj.duration = file.duration * 1000 + 1000;
                arr[index] = obj;
                var bool = true;
                for (var i = 0; i < reallen; i++) {
                    if (!arr[i]) {
                        bool = false;
                        break;
                    }
                }
                if (bool) {
                    var start = 0;
                    for (var i = 0; i < reallen; i++) {
                        var tmp = arr[i];
                        if (!tmp) {
                            console.log(i, reallen);
                        }
                        var name_3 = tmp.name, duration = tmp.duration;
                        outobj[name_3] = [start, duration];
                        start += duration;
                    }
                    fs.writeFileSync(outdir + "sound.json", JSON.stringify(outobj));
                }
                // console.log(JSON.stringify(outobj));
            }
        };
    }
    // ffmpeg('E:/nodeffmpeg/sound/insert.wav')
    //     .input('E:/nodeffmpeg/sound/logon.wav')
    //     .input('E:/nodeffmpeg/sound/logon.wav')
    //     .on('error', function (err) {
    //         console.log('An error occurred: ' + err.message);
    //     })
    //     .on('end', function () {
    //         console.log('Merging finished !');
    //     })
    //     .mergeToFile('E:/nodeffmpeg/sound/merged.wav');
    // ffmpeg.ffprobe('E:/nodeffmpeg/sound/insert.wav', (err, data) => {
    //     if (err) {
    //         console.log(err);
    //     } else if (data) {
    //         let audio = data.streams[0];
    //         let duration = audio.duration * 1000;
    //         console.log("duration:" + audio.duration);
    //         console.log(JSON.stringify(data));
    //     }
    // })
}
