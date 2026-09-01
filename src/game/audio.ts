import { getScene } from "./scenes";

export type Mix = {
  master: number;
  music: number;
  sfx: number;
};

type AudioApi = {
  unlock: () => void;
  setMix: (mix: Mix) => void;
  getMix: () => Mix;
  whoosh: (power: number) => void;
  bounce: (strength?: number) => void;
  rim: (strength?: number) => void;
  board: (strength?: number) => void;
  swish: () => void;
  score: (swish: boolean, combo: number) => void;
  miss: () => void;
  burn: () => void;
  playBgm: () => void;
  stopBgm: () => void;
  buzzer: () => void;
};

const RIM_GAP = 0.85;
const BOARD_GAP = 0.7;
const BOUNCE_GAP = 0.16;

export function createAudio(): AudioApi {
  const pack = getScene().sfx;
  const RIM_SRCS = pack.rim;
  const NET_SRCS = pack.net;
  const BOUNCE_SRCS = pack.bounce;
  const BOARD_SRCS = pack.board;
  const BGM_SRC = pack.bgm;
  const OVER_SRC = pack.over;
  const BUZZER_SRC = pack.buzzer;
  const COMBO_SRC = pack.combo;
  const COMBO2_SRC = pack.combo2;
  const BGM_VOL = 0.3;
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let sfx: GainNode | null = null;
  let music: GainNode | null = null;
  let mix: Mix = { master: 1, music: 1, sfx: 1 };
  const rimBufs: AudioBuffer[] = [];
  const netBufs: AudioBuffer[] = [];
  const bounceBufs: AudioBuffer[] = [];
  const boardBufs: AudioBuffer[] = [];
  let bgmBuf: AudioBuffer | null = null;
  let bgmSrc: AudioBufferSourceNode | null = null;
  let overBuf: AudioBuffer | null = null;
  let buzzerBuf: AudioBuffer | null = null;
  let comboBuf: AudioBuffer | null = null;
  let combo2Buf: AudioBuffer | null = null;
  let bgmWanted = false;
  let bgmRaw: ArrayBuffer | null = null;
  let samplesLoading = false;
  let lastRimAt = -99;
  let lastRimIdx = -1;
  let rimBusyUntil = -99;
  let lastNetIdx = -1;
  let lastBounceAt = -99;
  let lastBounceIdx = -1;
  let lastBoardAt = -99;

  void fetch(BGM_SRC)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(BGM_SRC))))
    .then((ab) => {
      bgmRaw = ab;
      if (ctx) decodeBgm();
    })
    .catch(() => {});

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC({ latencyHint: "interactive" });
      master = ctx.createGain();
      sfx = ctx.createGain();
      music = ctx.createGain();
      sfx.gain.value = Math.min(1, 0.92 * mix.sfx * 2);
      music.gain.value = 0.0001;
      sfx.connect(master);
      music.connect(master);
      master.connect(ctx.destination);
      master.gain.value = Math.min(1.5, mix.master * 2);
      loadSamples();
      decodeBgm();
      return ctx;
    } catch {
      ctx = null;
      return null;
    }
  }

  function loadSamples() {
    if (samplesLoading || !ctx) return;
    samplesLoading = true;
    const decode = (src: string, into: AudioBuffer[]) => {
      void fetch(src)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(src))))
        .then((ab) => ctx!.decodeAudioData(ab.slice(0)))
        .then((buf) => {
          into.push(buf);
        })
        .catch(() => {});
    };
    for (const src of RIM_SRCS) decode(src, rimBufs);
    for (const src of NET_SRCS) decode(src, netBufs);
    for (const src of BOUNCE_SRCS) decode(src, bounceBufs);
    for (const src of BOARD_SRCS) decode(src, boardBufs);
    void fetch(OVER_SRC)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(OVER_SRC))))
      .then((ab) => ctx!.decodeAudioData(ab.slice(0)))
      .then((buf) => {
        overBuf = buf;
      })
      .catch(() => {});
    void fetch(BUZZER_SRC)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(BUZZER_SRC))))
      .then((ab) => ctx!.decodeAudioData(ab.slice(0)))
      .then((buf) => {
        buzzerBuf = buf;
      })
      .catch(() => {});
    void fetch(COMBO_SRC)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(COMBO_SRC))))
      .then((ab) => ctx!.decodeAudioData(ab.slice(0)))
      .then((buf) => {
        comboBuf = buf;
      })
      .catch(() => {});
    void fetch(COMBO2_SRC)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(COMBO2_SRC))))
      .then((ab) => ctx!.decodeAudioData(ab.slice(0)))
      .then((buf) => {
        combo2Buf = buf;
      })
      .catch(() => {});
    decodeBgm();
  }

  function decodeBgm() {
    if (!ctx || bgmBuf || !bgmRaw) return;
    const copy = bgmRaw.slice(0);
    void ctx
      .decodeAudioData(copy)
      .then((buf) => {
        bgmBuf = buf;
        if (bgmWanted) startBgm();
      })
      .catch(() => {});
  }

  function musicPeak() {
    return Math.max(0.0001, Math.min(0.7, BGM_VOL * mix.music * 2));
  }

  function masterPeak() {
    return Math.max(0.0001, Math.min(1.5, mix.master * 2));
  }

  function sfxPeak() {
    return Math.max(0.0001, Math.min(1, 0.92 * mix.sfx * 2));
  }

  function applyMix() {
    if (!ctx) return;
    const t = ctx.currentTime;
    if (master) {
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(masterPeak(), t, 0.03);
    }
    if (sfx) {
      sfx.gain.cancelScheduledValues(t);
      sfx.gain.setTargetAtTime(sfxPeak(), t, 0.03);
    }
    if (music && bgmWanted && bgmSrc) {
      music.gain.cancelScheduledValues(t);
      music.gain.setTargetAtTime(musicPeak(), t, 0.04);
    }
  }

  function startBgm() {
    if (!bgmWanted || !ctx || !music || !bgmBuf || bgmSrc) return;
    const src = ctx.createBufferSource();
    src.buffer = bgmBuf;
    src.loop = true;
    src.connect(music);
    const t = ctx.currentTime;
    music.gain.cancelScheduledValues(t);
    music.gain.setValueAtTime(0.0001, t);
    music.gain.exponentialRampToValueAtTime(musicPeak(), t + 0.06);
    src.start();
    bgmSrc = src;
  }

  function haltBgm() {
    bgmWanted = false;
    if (!ctx || !music) return;
    const t = ctx.currentTime;
    music.gain.cancelScheduledValues(t);
    music.gain.setValueAtTime(Math.max(0.0001, music.gain.value), t);
    music.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    if (bgmSrc) {
      try {
        bgmSrc.stop(t + 0.32);
      } catch {
        /* already stopped */
      }
      bgmSrc = null;
    }
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === "suspended") void c.resume().catch(() => {});
    loadSamples();
    if (bgmWanted) startBgm();
  }

  function setMix(next: Mix) {
    mix = {
      master: Math.max(0, Math.min(1, next.master)),
      music: Math.max(0, Math.min(1, next.music)),
      sfx: Math.max(0, Math.min(1, next.sfx)),
    };
    applyMix();
  }

  function envGain(duration: number, peak: number, attack = 0.003) {
    const c = ensure();
    if (!c || !sfx) return null;
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    g.connect(sfx);
    return g;
  }

  function osc(freq: number, duration: number, type: OscillatorType, peak: number, slide = 0) {
    const c = ensure();
    const gain = envGain(duration, peak);
    if (!c || !gain) return;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), c.currentTime + duration);
    o.connect(gain);
    o.start();
    o.stop(c.currentTime + duration + 0.02);
  }

  function noise(duration: number, peak: number, hp = 400, lp = 1800, attack = 0.003) {
    const c = ensure();
    const gain = envGain(duration, peak, attack);
    if (!c || !gain) return;
    const n = Math.max(1, Math.floor(c.sampleRate * duration));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.97 + white * 0.03;
      data[i] = last * 0.78 + white * 0.22;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const high = c.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = hp;
    const low = c.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = lp;
    src.connect(high);
    high.connect(low);
    low.connect(gain);
    src.start();
  }

  function rubberThud(strength: number) {
    const s = Math.min(1, Math.max(0.18, strength));
    const j = Math.random();
    osc(72 + j * 10, 0.2, "sine", 0.3 * s, -22);
    osc(148 + j * 16, 0.1, "triangle", 0.13 * s, -44);
    noise(0.05, 0.17 * s, 160, 780, 0.0015);
    noise(0.016, 0.09 * s, 1100, 3600, 0.0006);
  }

  function playBuf(buf: AudioBuffer, peak = 0.78) {
    const c = ensure();
    if (!c || !sfx) return 0;
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = peak;
    src.connect(g);
    g.connect(sfx);
    src.start();
    return buf.duration;
  }

  function synthRim() {
    const j = Math.random();
    osc(790 + j * 40, 0.09, "triangle", 0.15, -240);
    osc(1220 + j * 50, 0.06, "sine", 0.08, -360);
    osc(1860, 0.035, "square", 0.022, -520);
    noise(0.032, 0.09, 1600, 5600, 0.0007);
  }

  return {
    unlock,
    setMix,
    getMix() {
      return { ...mix };
    },
    whoosh(power) {
      const p = Math.min(1, Math.max(0.2, power));
      noise(0.16, 0.11 * p, 280, 2400, 0.01);
      osc(120 + p * 36, 0.07, "sine", 0.025 * p, 50);
    },
    bounce(strength = 0.5) {
      const c = ensure();
      if (!c) return;
      if (c.currentTime - lastBounceAt < BOUNCE_GAP) return;
      lastBounceAt = c.currentTime;
      const s = Math.min(1, Math.max(0.18, strength));
      if (bounceBufs.length === 0) {
        rubberThud(s);
        return;
      }
      let i = Math.floor(Math.random() * bounceBufs.length);
      if (bounceBufs.length > 1 && i === lastBounceIdx) i = (i + 1) % bounceBufs.length;
      lastBounceIdx = i;
      playBuf(bounceBufs[i]!, 0.55 + 0.4 * s);
    },
    rim(strength = 0.7) {
      const c = ensure();
      if (!c) return;
      if (c.currentTime < rimBusyUntil) return;
      if (c.currentTime - lastRimAt < RIM_GAP) return;
      lastRimAt = c.currentTime;
      const s = Math.min(1, Math.max(0.22, strength));
      if (rimBufs.length === 0) {
        synthRim();
        rimBusyUntil = c.currentTime + RIM_GAP;
        return;
      }
      let i = Math.floor(Math.random() * rimBufs.length);
      if (rimBufs.length > 1 && i === lastRimIdx) i = (i + 1) % rimBufs.length;
      lastRimIdx = i;
      const buf = rimBufs[i]!;
      playBuf(buf, 0.16 + 0.26 * s);
      rimBusyUntil = c.currentTime + Math.max(RIM_GAP, buf.duration * 0.9);
    },
    board(strength = 0.7) {
      const c = ensure();
      if (!c) return;
      if (c.currentTime - lastBoardAt < BOARD_GAP) return;
      lastBoardAt = c.currentTime;
      const s = Math.min(1, Math.max(0.18, strength));
      if (boardBufs.length === 0) {
        osc(198, 0.13, "sine", 0.1 * s, -28);
        osc(920, 0.04, "triangle", 0.03 * s, -180);
        noise(0.07, 0.1 * s, 320, 2600, 0.0012);
        return;
      }
      playBuf(boardBufs[0]!, 0.22 + 0.4 * s);
    },
    swish() {
      const c = ensure();
      if (!c) return;
      if (netBufs.length === 0) {
        noise(0.4, 0.22, 1500, 6200, 0.016);
        noise(0.2, 0.09, 3200, 8800, 0.005);
        return;
      }
      let i = Math.floor(Math.random() * netBufs.length);
      if (netBufs.length > 1 && i === lastNetIdx) i = (i + 1) % netBufs.length;
      lastNetIdx = i;
      playBuf(netBufs[i]!, 0.86);
    },
    score(isSwish, combo) {
      if (!isSwish) {
        rubberThud(0.32);
        noise(0.14, 0.1, 600, 2200, 0.005);
      } else {
        osc(190, 0.18, "sine", 0.05, 28);
      }
      if (combo >= 3) osc(160 + combo * 6, 0.2, "sine", 0.04, 48);
      if (combo >= 10) noise(0.22, 0.1, 140, 700, 0.012);
      if (combo >= 20 && combo2Buf) playBuf(combo2Buf, 0.46);
      else if (combo >= 15 && comboBuf) playBuf(comboBuf, 0.46);
    },
    miss() {
      haltBgm();
      if (overBuf) {
        playBuf(overBuf, BGM_VOL);
        return;
      }
      osc(88, 0.3, "sine", 0.13, -32);
      noise(0.2, 0.09, 90, 420, 0.018);
    },
    burn() {
      noise(0.55, 0.2, 60, 620, 0.02);
      osc(74, 0.42, "sine", 0.09, -16);
      noise(0.28, 0.07, 1200, 3400, 0.01);
    },
    playBgm() {
      bgmWanted = true;
      const c = ensure();
      if (c && c.state === "suspended") void c.resume().catch(() => {});
      startBgm();
    },
    stopBgm() {
      haltBgm();
    },
    buzzer() {
      if (buzzerBuf) {
        playBuf(buzzerBuf, 0.9);
        if (ctx && music && bgmWanted) {
          const t = ctx.currentTime;
          const hold = Math.max(3.2, buzzerBuf.duration * 0.85);
          music.gain.cancelScheduledValues(t);
          music.gain.setValueAtTime(Math.max(0.0001, music.gain.value), t);
          music.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.08 * mix.music * 2), t + 0.12);
          music.gain.setValueAtTime(Math.max(0.0001, 0.08 * mix.music * 2), t + hold);
          if (bgmWanted) music.gain.exponentialRampToValueAtTime(musicPeak(), t + hold + 0.8);
        }
        return;
      }
      osc(220, 0.4, "sawtooth", 0.12, -80);
    },
  };
}
