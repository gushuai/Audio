import fs = require('fs')
import path = require('path')
import async = require('async')
import _ = require('underscore')
import glob = require('glob');
import process = require("process");
import fsextra = require("fs-extra");

const defaults = {
    output: 'output',
    path: '',
    export: 'mp3',
    format: "howler",
    autoplay: null,
    loop: [],
    silence: 0,
    gap: 1,
    minlength: 0,
    bitrate: 128,
    vbr: -1,
    'vbr:vorbis': -1,
    samplerate: 44100,
    channels: 1,
    rawparts: '',
    ignorerounding: 0,
    logger: {
        debug: function (val: string, obj: any) {
            console.log(val, JSON.stringify(obj));
        },
        info: function (val: any) {
            console.log(val);
        },
        log: function (val: string, obj?: any) {
            console.log(val, val);
        }
    }
}

let cwd = process.cwd();

console.log(process.argv);

let args = process.argv;
let len = args.length;
if (len > 2) {
    for (let i = 2; i < len; i++) {
        let tmp = args[i];
        let arr = tmp.split(":");
        let key = arr[0];
        let val: any = arr[1];
        if (key == "bitrate" || key == "gap") {
            val = +val;
        }
        (defaults as any)[key] = val;
    }
}
cwd = cwd + "\\sound\\";
let prefix = cwd;
let outdir = prefix + "\\out\\";
let extname = ".mp3";

(defaults as any).path = "\\sound\\out\\";

if (fsextra.existsSync(outdir)) {
    fsextra.removeSync(outdir);
}
fsextra.mkdirSync(outdir);

fs.readdir(prefix, (err, files) => {
    if (files) {
        let len = files.length;
        let tmps: string[] = [];
        for (let i = 0; i < len; i++) {
            let file = files[i];
            let tmp = prefix + file
            let stat = fs.statSync(tmp);
            if (stat.isFile()) {
                let ext = path.extname(tmp);
                if (ext == extname) {
                    tmps.push(tmp)
                }
            }
        }
        main(tmps);
    }
});

function main(files: string[]) {
    let opts: any = {};

    if (!files || !files.length) {
        return console.error('No input files specified.');
    }

    opts = _.extend({}, defaults, opts)

    let offsetCursor = 0
    const wavArgs = ['-ar', opts.samplerate, '-ac', opts.channels, '-f', 's16le']
    const tempFile = mktemp('audiosprite')

    opts.logger.debug('Created temporary file', { file: tempFile })

    const json: any = {
        resources: []
        , spritemap: {}
    }

    spawn('ffmpeg', ['-version']).on('exit', (code: any) => {
        if (code) {
            console.error('ffmpeg was not found on your path');
        }

        if (opts.silence) {
            json.spritemap.silence = {
                start: 0
                , end: opts.silence
                , loop: true
            }

            if (!opts.autoplay) {
                json.autoplay = 'silence'
            }

            appendSilence(opts.silence + opts.gap, tempFile, processFiles)
        } else {
            processFiles()
        }
    })

    function mktemp(prefix: string) {
        let tmpdir = require('os').tmpdir() || '.';
        return path.join(tmpdir, prefix + '.' + Math.random().toString().substr(2));
    }

    function spawn(name: string, opt: any) {
        opts.logger.debug('Spawn', { cmd: [name].concat(opt).join(' ') });
        return require('child_process').spawn(name, opt);
    }

    function pad(num: number, size: number) {
        let str = num.toString();

        while (str.length < size) {
            str = '0' + str;
        }

        return str;
    }

    function makeRawAudioFile(src: string, cb: Function) {
        let dest = mktemp('audiosprite')

        opts.logger.debug('Start processing', { file: src })

        fs.exists(src, function (exists) {
            if (exists) {
                let ffmpeg = spawn('ffmpeg', ['-i', path.resolve(src)]
                    .concat(wavArgs).concat('pipe:'))
                ffmpeg.stdout.pipe(fs.createWriteStream(dest, { flags: 'w' }))
                ffmpeg.on('close', function (code: number, signal: any) {
                    if (code) {
                        return cb({
                            msg: 'File could not be added',
                            file: src,
                            retcode: code,
                            signal: signal
                        })
                    }
                    cb(null, dest)
                })
            }
            else {
                cb({ msg: 'File does not exist', file: src })
            }
        })
    }

    function appendFile(name: string, src: string, dest: string, cb: Function) {
        let size = 0
        let reader = fs.createReadStream(src)
        let writer = fs.createWriteStream(dest, {
            flags: 'a'
        })
        reader.on('data', function (data) {
            size += data.length
        })
        reader.on('close', function () {
            let originalDuration = size / opts.samplerate / opts.channels / 2
            opts.logger.info('File added OK', { file: src, duration: originalDuration })
            let extraDuration = Math.max(0, opts.minlength - originalDuration)
            let duration = originalDuration + extraDuration
            json.spritemap[name] = {
                start: offsetCursor
                , end: offsetCursor + duration
                , loop: name === opts.autoplay || opts.loop.indexOf(name) !== -1
            }
            offsetCursor += originalDuration

            let delta = Math.ceil(duration) - duration;

            if (opts.ignorerounding) {
                opts.logger.info('Ignoring nearest second silence gap rounding');
                extraDuration = 0;
                delta = 0;
            }

            appendSilence(extraDuration + delta + opts.gap, dest, cb)
        })
        reader.pipe(writer)
    }

    function appendSilence(duration: number, dest: string, cb: Function) {
        let buffer = Buffer.alloc(Math.round(opts.samplerate * 2 * opts.channels * duration));
        // let buffer = new Buffer(Math.round(opts.samplerate * 2 * opts.channels * duration))
        buffer.fill(0)
        let writeStream = fs.createWriteStream(dest, { flags: 'a' })
        writeStream.end(buffer)
        writeStream.on('close', function () {
            opts.logger.info('Silence gap added', { duration: duration })
            offsetCursor += duration
            cb()
        })
    }

    function exportFile(src: string, dest: string, ext: string, opt: any, store: boolean, cb: Function) {
        let outfile = dest + '.' + ext;

        spawn('ffmpeg', ['-y', '-ar', opts.samplerate, '-ac', opts.channels, '-f', 's16le', '-i', src]
            .concat(opt).concat(outfile))
            .on('exit', function (code: number, signal: any) {
                if (code) {
                    return cb({
                        msg: 'Error exporting file',
                        format: ext,
                        retcode: code,
                        signal: signal
                    })
                }
                if (ext === 'aiff') {
                    exportFileCaf(outfile, dest + '.caf', function (err: Error) {
                        if (!err && store) {
                            json.resources.push(dest + '.caf')
                        }
                        fs.unlinkSync(outfile)
                        cb()
                    })
                } else {
                    opts.logger.info('Exported ' + ext + ' OK', { file: outfile })
                    if (store) {
                        json.resources.push(outfile)
                    }
                    cb()
                }
            })
    }

    function exportFileCaf(src: string, dest: string, cb: Function) {
        if (process.platform !== 'darwin') {
            return cb(true)
        }

        spawn('afconvert', ['-f', 'caff', '-d', 'ima4', src, dest])
            .on('exit', function (code: number, signal: any) {
                if (code) {
                    return cb({
                        msg: 'Error exporting file',
                        format: 'caf',
                        retcode: code,
                        signal: signal
                    })
                }
                opts.logger.info('Exported caf OK', { file: dest })
                return cb()
            })
    }

    function processFiles() {
        let formats: any = {
            aiff: []
            , wav: []
            , ac3: ['-acodec', 'ac3', '-ab', opts.bitrate + 'k']
            , mp3: ['-ar', opts.samplerate, '-f', 'mp3']
            , mp4: ['-ab', opts.bitrate + 'k']
            , m4a: ['-ab', opts.bitrate + 'k', '-strict', '-2']
            , ogg: ['-acodec', 'libvorbis', '-f', 'ogg', '-ab', opts.bitrate + 'k']
            , opus: ['-acodec', 'libopus', '-ab', opts.bitrate + 'k']
            , webm: ['-acodec', 'libvorbis', '-f', 'webm', '-dash', '1']
        };

        if (opts.vbr >= 0 && opts.vbr <= 9) {
            formats.mp3 = formats.mp3.concat(['-aq', opts.vbr])
        }
        else {
            formats.mp3 = formats.mp3.concat(['-ab', opts.bitrate + 'k'])
        }

        // change quality of webm output - https://trac.ffmpeg.org/wiki/TheoraVorbisEncodingGuide
        if (opts['vbr:vorbis'] >= 0 && opts['vbr:vorbis'] <= 10) {
            formats.webm = formats.webm.concat(['-qscale:a', opts['vbr:vorbis']])
        }
        else {
            formats.webm = formats.webm.concat(['-ab', opts.bitrate + 'k'])
        }

        if (opts.export.length) {
            formats = opts.export.split(',').reduce(function (memo: any, val: string) {
                if (formats[val]) {
                    memo[val] = formats[val]
                }
                return memo
            }, {})
        }

        let rawparts = opts.rawparts.length ? opts.rawparts.split(',') : null
        let i = 0
        opts.logger.info(files);
        async.forEachSeries(files, function (file: string, cb: Function) {
            i++;
            makeRawAudioFile(file, function (err: Error, tmp: string) {
                if (err) {
                    opts.logger.debug(err);
                    return cb(err)
                }

                function tempProcessed() {
                    fs.unlinkSync(tmp)
                    cb()
                }

                let name = path.basename(file).replace(/\.[a-zA-Z0-9]+$/, '')
                appendFile(name, tmp, tempFile, function (err: Error) {
                    if (rawparts != null ? rawparts.length : void 0) {
                        async.forEachSeries(rawparts, function (ext: string, cb: Function) {
                            opts.logger.debug('Start export slice', { name: name, format: ext, i: i })
                            exportFile(tmp, outdir + opts.output + '_' + pad(i, 3), ext, formats[ext]
                                , false, cb)
                        }, tempProcessed)
                    } else {
                        tempProcessed()
                    }
                })
            })
        }, function (err: any) {
            if (err) {
                return console.error('Error adding file ' + err.message);
            }

            async.forEachSeries(Object.keys(formats), function (ext: string, cb: Function) {
                opts.logger.debug('Start export', { format: ext })
                exportFile(tempFile, outdir + opts.output, ext, formats[ext], true, cb)
            }, function (err: any) {
                if (err) {
                    return console.error('Error exporting file');
                }
                if (opts.autoplay) {
                    json.autoplay = opts.autoplay
                }

                json.resources = json.resources.map(function (e: string) {
                    return opts.path ? path.join(opts.path, path.basename(e)) : e
                })

                let finalJson: any = {}

                switch (opts.format) {

                    case 'howler':
                    case 'howler2':
                        finalJson[opts.format === 'howler' ? 'urls' : 'src'] = [].concat(json.resources.map((val: string) => {
                            return path.basename(val);
                        }))
                        finalJson.sprite = {}
                        for (let sn in json.spritemap) {
                            let spriteInfo = json.spritemap[sn]
                            finalJson.sprite[sn] = [spriteInfo.start * 1000, (spriteInfo.end - spriteInfo.start) * 1000]
                            if (spriteInfo.loop) {
                                finalJson.sprite[sn].push(true)
                            }
                        }
                        break

                    case 'createjs':
                        finalJson.src = json.resources[0]
                        finalJson.data = { audioSprite: [] }
                        for (let sn in json.spritemap) {
                            let spriteInfo = json.spritemap[sn]
                            finalJson.data.audioSprite.push({
                                id: sn,
                                startTime: spriteInfo.start * 1000,
                                duration: (spriteInfo.end - spriteInfo.start) * 1000
                            })
                        }
                        break

                    case 'default':
                    default:
                        finalJson = json
                        break
                }

                fs.unlinkSync(tempFile);
                fs.writeFileSync(outdir + "sound.json", JSON.stringify(finalJson));
            })
        })
    }
}
