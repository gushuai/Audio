let SN_SEED = 1

const _innerAudioContextMap = {};

class Audio extends HTMLAudioElement {
    private _$sn: number;

    private _canplayEvents: string[];

    private _loaded: boolean;

    private _paused: boolean;

    private _muted: boolean;

    private _volume: number;

    private _loop: boolean;

    private _autoplay: boolean;

    private _src: string;

    public static HAVE_NOTHING = 0;
    public static HAVE_METADATA = 1;
    public static HAVE_CURRENT_DATA = 2;
    public static HAVE_FUTURE_DATA = 3;
    public static HAVE_ENOUGH_DATA = 4;
    constructor(url?: string) {
        super()

        this._$sn = SN_SEED++;

        this.readyState = Audio.HAVE_NOTHING;

        const innerAudioContext = (window as any).wx.createInnerAudioContext();

        _innerAudioContextMap[this._$sn] = innerAudioContext;

        this._canplayEvents = [
            'load',
            'loadend',
            'canplay',
            'canplaythrough',
            'loadedmetadata'
        ]

        innerAudioContext.onCanplay(() => {
            this._loaded = true;
            this.readyState = Audio.HAVE_CURRENT_DATA;

            this._canplayEvents.forEach((type: string) => {
                this.dispatchEvent({ type: type } as any);
            })
        })
        innerAudioContext.onPlay(() => {
            this._paused = _innerAudioContextMap[this._$sn].paused;
            this.dispatchEvent({ type: 'play' } as any)
        })
        innerAudioContext.onPause(() => {
            this._paused = _innerAudioContextMap[this._$sn].paused;
            this.dispatchEvent({ type: 'pause' } as any)
        })
        innerAudioContext.onEnded(() => {
            this._paused = _innerAudioContextMap[this._$sn].paused;
            if (_innerAudioContextMap[this._$sn].loop === false) {
                this.dispatchEvent({ type: 'ended' } as any);
            }
            this.readyState = Audio.HAVE_ENOUGH_DATA;
        })
        innerAudioContext.onError(() => {
            this._paused = _innerAudioContextMap[this._$sn].paused;
            this.dispatchEvent({ type: 'error' } as any);
        })

        if (url) {
            this.src = url;
        } else {
            this._src = '';
        }

        this._loop = innerAudioContext.loop;
        this._autoplay = innerAudioContext.autoplay;
        this._paused = innerAudioContext.paused;
        this._volume = innerAudioContext.volume;
        this._muted = false;
    }

    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options = {}) {
        type = String(type).toLowerCase()

        super.addEventListener(type, listener, options as any)

        if (this._loaded && this._canplayEvents.indexOf(type) !== -1) {
            this.dispatchEvent({ type: type } as any)
        }
    }

    load() {
        // console.warn('HTMLAudioElement.load() is not implemented.')
        // weixin doesn't need call load() manually
    }

    play() {
        _innerAudioContextMap[this._$sn].play();
    }

    resume() {
        _innerAudioContextMap[this._$sn].resume();
    }

    pause() {
        _innerAudioContextMap[this._$sn].pause();
    }

    destroy() {
        _innerAudioContextMap[this._$sn].destroy();
    }

    canPlayType(mediaType = '') {
        if (typeof mediaType !== 'string') {
            return ''
        }

        if (mediaType.indexOf('audio/mpeg') > -1 || mediaType.indexOf('audio/mp4')) {
            return 'probably'
        }
        return ''
    }

    get currentTime() {
        return _innerAudioContextMap[this._$sn].currentTime;
    }

    set currentTime(value) {
        _innerAudioContextMap[this._$sn].seek(value);
    }

    get duration() {
        return _innerAudioContextMap[this._$sn].duration;
    }

    get src() {
        return this._src;
    }

    set src(value: string) {
        this._src = value;
        this._loaded = false;
        this.readyState = Audio.HAVE_NOTHING;

        const innerAudioContext = _innerAudioContextMap[this._$sn];

        innerAudioContext.src = value;
    }

    get loop() {
        return this._loop;
    }

    set loop(value: boolean) {
        this._loop = value;
        _innerAudioContextMap[this._$sn].loop = value;
    }

    get autoplay() {
        return this._autoplay;
    }

    set autoplay(value: boolean) {
        this._autoplay = value;
        _innerAudioContextMap[this._$sn].autoplay = value;
    }

    get paused() {
        return this._paused;
    }

    get volume() {
        return this._volume;
    }

    set volume(value: number) {
        this._volume = value;
        if (!this._muted) {
            _innerAudioContextMap[this._$sn].volume = value;
        }
    }

    get muted() {
        return this._muted;
    }

    set muted(value: boolean) {
        this._muted = value;
        if (value) {
            _innerAudioContextMap[this._$sn].volume = 0;
        } else {
            _innerAudioContextMap[this._$sn].volume = this._volume;
        }
    }

    cloneNode() {
        const newAudio = new Audio()
        newAudio.loop = this.loop;
        newAudio.autoplay = this.autoplay;
        newAudio.src = this.src;
        return newAudio;
    }
}
