"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs");
var path = require("path");
var async = require("async");
var _ = require("underscore");
var process = require("process");
var fsextra = require("fs-extra");
var defaults = {
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
        debug: function (val, obj) {
            console.log(val, JSON.stringify(obj));
        },
        info: function (val) {
            console.log(val);
        },
        log: function (val, obj) {
            console.log(val, val);
        }
    }
};
var cwd = process.cwd();
console.log(process.argv);
var args = process.argv;
var len = args.length;
if (len > 2) {
    for (var i = 2; i < len; i++) {
        var tmp = args[i];
        var arr = tmp.split(":");
        var key = arr[0];
        var val = arr[1];
        if (key == "bitrate" || key == "gap") {
            val = +val;
        }
        defaults[key] = val;
    }
}
cwd = cwd + "\\sound\\";
var prefix = cwd;
var outdir = prefix + "\\out\\";
var extname = ".mp3";
defaults.path = "\\sound\\out\\";
if (fsextra.existsSync(outdir)) {
    fsextra.removeSync(outdir);
}
fsextra.mkdirSync(outdir);
fs.readdir(prefix, function (err, files) {
    if (files) {
        var len_1 = files.length;
        var tmps = [];
        for (var i = 0; i < len_1; i++) {
            var file = files[i];
            var tmp = prefix + file;
            var stat = fs.statSync(tmp);
            if (stat.isFile()) {
                var ext = path.extname(tmp);
                if (ext == extname) {
                    tmps.push(tmp);
                }
            }
        }
        main(tmps);
    }
});
function main(files) {
    var opts = {};
    if (!files || !files.length) {
        return console.error('No input files specified.');
    }
    opts = _.extend({}, defaults, opts);
    var offsetCursor = 0;
    var wavArgs = ['-ar', opts.samplerate, '-ac', opts.channels, '-f', 's16le'];
    var tempFile = mktemp('audiosprite');
    opts.logger.debug('Created temporary file', { file: tempFile });
    var json = {
        resources: [],
        spritemap: {}
    };
    spawn('ffmpeg', ['-version']).on('exit', function (code) {
        if (code) {
            console.error('ffmpeg was not found on your path');
        }
        if (opts.silence) {
            json.spritemap.silence = {
                start: 0,
                end: opts.silence,
                loop: true
            };
            if (!opts.autoplay) {
                json.autoplay = 'silence';
            }
            appendSilence(opts.silence + opts.gap, tempFile, processFiles);
        }
        else {
            processFiles();
        }
    });
    function mktemp(prefix) {
        var tmpdir = require('os').tmpdir() || '.';
        return path.join(tmpdir, prefix + '.' + Math.random().toString().substr(2));
    }
    function spawn(name, opt) {
        opts.logger.debug('Spawn', { cmd: [name].concat(opt).join(' ') });
        return require('child_process').spawn(name, opt);
    }
    function pad(num, size) {
        var str = num.toString();
        while (str.length < size) {
            str = '0' + str;
        }
        return str;
    }
    function makeRawAudioFile(src, cb) {
        var dest = mktemp('audiosprite');
        opts.logger.debug('Start processing', { file: src });
        fs.exists(src, function (exists) {
            if (exists) {
                var ffmpeg = spawn('ffmpeg', ['-i', path.resolve(src)]
                    .concat(wavArgs).concat('pipe:'));
                ffmpeg.stdout.pipe(fs.createWriteStream(dest, { flags: 'w' }));
                ffmpeg.on('close', function (code, signal) {
                    if (code) {
                        return cb({
                            msg: 'File could not be added',
                            file: src,
                            retcode: code,
                            signal: signal
                        });
                    }
                    cb(null, dest);
                });
            }
            else {
                cb({ msg: 'File does not exist', file: src });
            }
        });
    }
    function appendFile(name, src, dest, cb) {
        var size = 0;
        var reader = fs.createReadStream(src);
        var writer = fs.createWriteStream(dest, {
            flags: 'a'
        });
        reader.on('data', function (data) {
            size += data.length;
        });
        reader.on('close', function () {
            var originalDuration = size / opts.samplerate / opts.channels / 2;
            opts.logger.info('File added OK', { file: src, duration: originalDuration });
            var extraDuration = Math.max(0, opts.minlength - originalDuration);
            var duration = originalDuration + extraDuration;
            json.spritemap[name] = {
                start: offsetCursor,
                end: offsetCursor + duration,
                loop: name === opts.autoplay || opts.loop.indexOf(name) !== -1
            };
            offsetCursor += originalDuration;
            var delta = Math.ceil(duration) - duration;
            if (opts.ignorerounding) {
                opts.logger.info('Ignoring nearest second silence gap rounding');
                extraDuration = 0;
                delta = 0;
            }
            appendSilence(extraDuration + delta + opts.gap, dest, cb);
        });
        reader.pipe(writer);
    }
    function appendSilence(duration, dest, cb) {
        var buffer = Buffer.alloc(Math.round(opts.samplerate * 2 * opts.channels * duration));
        // let buffer = new Buffer(Math.round(opts.samplerate * 2 * opts.channels * duration))
        buffer.fill(0);
        var writeStream = fs.createWriteStream(dest, { flags: 'a' });
        writeStream.end(buffer);
        writeStream.on('close', function () {
            opts.logger.info('Silence gap added', { duration: duration });
            offsetCursor += duration;
            cb();
        });
    }
    function exportFile(src, dest, ext, opt, store, cb) {
        var outfile = dest + '.' + ext;
        spawn('ffmpeg', ['-y', '-ar', opts.samplerate, '-ac', opts.channels, '-f', 's16le', '-i', src]
            .concat(opt).concat(outfile))
            .on('exit', function (code, signal) {
            if (code) {
                return cb({
                    msg: 'Error exporting file',
                    format: ext,
                    retcode: code,
                    signal: signal
                });
            }
            if (ext === 'aiff') {
                exportFileCaf(outfile, dest + '.caf', function (err) {
                    if (!err && store) {
                        json.resources.push(dest + '.caf');
                    }
                    fs.unlinkSync(outfile);
                    cb();
                });
            }
            else {
                opts.logger.info('Exported ' + ext + ' OK', { file: outfile });
                if (store) {
                    json.resources.push(outfile);
                }
                cb();
            }
        });
    }
    function exportFileCaf(src, dest, cb) {
        if (process.platform !== 'darwin') {
            return cb(true);
        }
        spawn('afconvert', ['-f', 'caff', '-d', 'ima4', src, dest])
            .on('exit', function (code, signal) {
            if (code) {
                return cb({
                    msg: 'Error exporting file',
                    format: 'caf',
                    retcode: code,
                    signal: signal
                });
            }
            opts.logger.info('Exported caf OK', { file: dest });
            return cb();
        });
    }
    function processFiles() {
        var formats = {
            aiff: [],
            wav: [],
            ac3: ['-acodec', 'ac3', '-ab', opts.bitrate + 'k'],
            mp3: ['-ar', opts.samplerate, '-f', 'mp3'],
            mp4: ['-ab', opts.bitrate + 'k'],
            m4a: ['-ab', opts.bitrate + 'k', '-strict', '-2'],
            ogg: ['-acodec', 'libvorbis', '-f', 'ogg', '-ab', opts.bitrate + 'k'],
            opus: ['-acodec', 'libopus', '-ab', opts.bitrate + 'k'],
            webm: ['-acodec', 'libvorbis', '-f', 'webm', '-dash', '1']
        };
        if (opts.vbr >= 0 && opts.vbr <= 9) {
            formats.mp3 = formats.mp3.concat(['-aq', opts.vbr]);
        }
        else {
            formats.mp3 = formats.mp3.concat(['-ab', opts.bitrate + 'k']);
        }
        // change quality of webm output - https://trac.ffmpeg.org/wiki/TheoraVorbisEncodingGuide
        if (opts['vbr:vorbis'] >= 0 && opts['vbr:vorbis'] <= 10) {
            formats.webm = formats.webm.concat(['-qscale:a', opts['vbr:vorbis']]);
        }
        else {
            formats.webm = formats.webm.concat(['-ab', opts.bitrate + 'k']);
        }
        if (opts.export.length) {
            formats = opts.export.split(',').reduce(function (memo, val) {
                if (formats[val]) {
                    memo[val] = formats[val];
                }
                return memo;
            }, {});
        }
        var rawparts = opts.rawparts.length ? opts.rawparts.split(',') : null;
        var i = 0;
        opts.logger.info(files);
        async.forEachSeries(files, function (file, cb) {
            i++;
            makeRawAudioFile(file, function (err, tmp) {
                if (err) {
                    opts.logger.debug(err);
                    return cb(err);
                }
                function tempProcessed() {
                    fs.unlinkSync(tmp);
                    cb();
                }
                var name = path.basename(file).replace(/\.[a-zA-Z0-9]+$/, '');
                appendFile(name, tmp, tempFile, function (err) {
                    if (rawparts != null ? rawparts.length : void 0) {
                        async.forEachSeries(rawparts, function (ext, cb) {
                            opts.logger.debug('Start export slice', { name: name, format: ext, i: i });
                            exportFile(tmp, outdir + opts.output + '_' + pad(i, 3), ext, formats[ext], false, cb);
                        }, tempProcessed);
                    }
                    else {
                        tempProcessed();
                    }
                });
            });
        }, function (err) {
            if (err) {
                return console.error('Error adding file ' + err.message);
            }
            async.forEachSeries(Object.keys(formats), function (ext, cb) {
                opts.logger.debug('Start export', { format: ext });
                exportFile(tempFile, outdir + opts.output, ext, formats[ext], true, cb);
            }, function (err) {
                if (err) {
                    return console.error('Error exporting file');
                }
                if (opts.autoplay) {
                    json.autoplay = opts.autoplay;
                }
                json.resources = json.resources.map(function (e) {
                    return opts.path ? path.join(opts.path, path.basename(e)) : e;
                });
                var finalJson = {};
                switch (opts.format) {
                    case 'howler':
                    case 'howler2':
                        finalJson[opts.format === 'howler' ? 'urls' : 'src'] = [].concat(json.resources.map(function (val) {
                            return path.basename(val);
                        }));
                        finalJson.sprite = {};
                        for (var sn in json.spritemap) {
                            var spriteInfo = json.spritemap[sn];
                            finalJson.sprite[sn] = [spriteInfo.start * 1000, (spriteInfo.end - spriteInfo.start) * 1000];
                            if (spriteInfo.loop) {
                                finalJson.sprite[sn].push(true);
                            }
                        }
                        break;
                    case 'createjs':
                        finalJson.src = json.resources[0];
                        finalJson.data = { audioSprite: [] };
                        for (var sn in json.spritemap) {
                            var spriteInfo = json.spritemap[sn];
                            finalJson.data.audioSprite.push({
                                id: sn,
                                startTime: spriteInfo.start * 1000,
                                duration: (spriteInfo.end - spriteInfo.start) * 1000
                            });
                        }
                        break;
                    case 'default':
                    default:
                        finalJson = json;
                        break;
                }
                fs.unlinkSync(tempFile);
                fs.writeFileSync(outdir + "sound.json", JSON.stringify(finalJson));
            });
        });
    }
}
