import ffmpeg = require("fluent-ffmpeg");
import fs = require("fs-extra");
import process = require("process");
import path = require("path");

main();

function main() {
    let cwd = process.cwd();

    cwd = cwd + "\\sound\\";

    let prefix = cwd;
    let outdir = prefix + "\\out\\";

    let extname = ".mp3";

    let rate = 80;

    let reallen = 0;
    if (fs.existsSync(outdir)) {
        fs.removeSync(outdir);
        fs.mkdirSync(outdir);
    }

    let blank = prefix + "blank" + extname;
    if (fs.existsSync(blank)) {
        fs.removeSync(blank);
    }
    //创建空白区域
    let buffer = new Buffer(Math.round(rate * 1 * 1024))
    buffer.fill(0)
    let writeStream = fs.createWriteStream(blank, { flags: 'a' })
    writeStream.end(buffer)
    writeStream.on('close', function () {

        fs.readdir(prefix, (err, files) => {
            if (files) {
                let len = files.length;
                let fileArr: any[] = [];
                let audio = ffmpeg();
                audio.audioBitrate(rate);
                for (let i = 0; i < len; i++) {
                    let file = files[i];
                    let tmp = prefix + file
                    let stat = fs.statSync(tmp);
                    if (stat.isFile()) {
                        let ext = path.extname(tmp);
                        let name = file.substring(0, file.length - ext.length);
                        if (ext == extname && name != "blank") {
                            audio = audio.input(tmp).input(blank);
                            fileArr.push({ name, url: tmp });
                        }
                    }
                }

                reallen = fileArr.length;

                for (let i = 0; i < reallen; i++) {
                    let obj = fileArr[i];
                    let { url, name } = obj;
                    ffmpeg.ffprobe(url, getCallBack(name, i));
                }

                audio.on("error", function (err) {
                    console.log('An error occurred: ' + err.message);
                }).on("end", function () {
                    console.log('Merging finished !');
                }).mergeToFile(outdir + "sound" + extname);
            }
        })
    })



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

    let outobj: any = {};
    let arr: any[] = [];
    function getCallBack(filename: string, index: number) {
        return function (err: any, data: any) {
            if (data) {
                let obj: any = {};
                obj.name = filename;
                let file = data.streams[0];
                obj.duration = file.duration * 1000 + 1000;
                arr[index] = obj;

                let bool = true;
                for (let i = 0; i < reallen; i++) {
                    if (!arr[i]) {
                        bool = false;
                        break;
                    }
                }
                if (bool) {
                    let start = 0;
                    for (let i = 0; i < reallen; i++) {
                        let tmp = arr[i];
                        if (!tmp) {
                            console.log(i, reallen);
                        }
                        let { name, duration } = tmp;
                        outobj[name] = [start, duration];
                        start += duration;
                    }
                    fs.writeFileSync(outdir + "sound.json", JSON.stringify(outobj));
                }
                // console.log(JSON.stringify(outobj));

            }
        }
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