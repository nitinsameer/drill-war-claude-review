import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Gauge,
  Gem,
  Home,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Star,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";

import menuArt from "@/assets/drill-war-menu.jpg";
import { Button } from "@/components/ui/button";
import { setDrillIntensity, setSoundEnabled, sfx, startDrillLoop, stopDrillLoop, unlockAudio } from "@/lib/arcade-audio";

type Screen = "menu" | "howto" | "settings" | "character" | "drill" | "countdown" | "game" | "results";
type CharacterId = "alex" | "mia" | "robo";
type DrillId = "mini" | "speed" | "power";


const characters = [
  { id: "alex" as const, name: "Alex", icon: "🧑🏻‍🚀", trait: "Brave explorer", perk: "+10% star value", color: "bg-amber" },
  { id: "mia" as const, name: "Mia", icon: "👩🏻‍🎤", trait: "Treasure hunter", perk: "+12% movement", color: "bg-coral" },
  { id: "robo" as const, name: "Robo", icon: "🤖", trait: "Built for the deep", perk: "+15% shield", color: "bg-cyan" },
];

const drills = [
  { id: "mini" as const, name: "Mini Drill", icon: "🚜", trait: "Balanced and reliable", speed: 3, power: 3, control: 4 },
  { id: "speed" as const, name: "Speed Drill", icon: "🏎️", trait: "Fast and agile", speed: 5, power: 2, control: 4 },
  { id: "power" as const, name: "Power Drill", icon: "⚙️", trait: "Crushes tough rock", speed: 2, power: 5, control: 3 },
];

type GameStats = { score: number; stars: number; gems: number; depth: number; combo: number; time: number };

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "brand brand-compact" : "brand"} aria-label="Drill War">
      <span>DRILL</span><strong>WAR</strong>
    </div>
  );
}

function StatPips({ value }: { value: number }) {
  return <div className="stat-pips">{[1, 2, 3, 4, 5].map((pip) => <i key={pip} className={pip <= value ? "active" : ""} />)}</div>;
}

function Joystick({ onVector }: { onVector: (x: number, y: number) => void }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const activeId = useRef<number | null>(null);

  const update = (event: React.PointerEvent) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const radius = rect.width / 2;
    let dx = (event.clientX - (rect.left + radius)) / radius;
    let dy = (event.clientY - (rect.top + radius)) / radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    setKnob({ x: dx * radius * 0.55, y: dy * radius * 0.55 });
    onVector(dx, dy);
  };

  const release = () => { activeId.current = null; setKnob({ x: 0, y: 0 }); onVector(0, 0); };

  return (
    <div
      ref={baseRef}
      className="joystick"
      role="application"
      aria-label="Steering joystick"
      onPointerDown={(event) => { activeId.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); update(event); }}
      onPointerMove={(event) => { if (activeId.current === event.pointerId) update(event); }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <span className="joystick-ring" />
      <span className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

function GameCanvas({ selectedCharacter, selectedDrill, paused, soundOn, onStats, onFinish }: {
  selectedCharacter: CharacterId;
  selectedDrill: DrillId;
  paused: boolean;
  soundOn: boolean;
  onStats: (stats: GameStats) => void;
  onFinish: (stats: GameStats) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keys = useRef({ left: false, right: false, up: false, down: false });
  const stick = useRef({ x: 0, y: 0 });
  const finishRef = useRef(false);

  const setInput = (key: keyof typeof keys.current, value: boolean) => {
    keys.current[key] = value;
  };

  useEffect(() => {
    startDrillLoop();
    return () => stopDrillLoop();
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (["ArrowLeft", "a", "A"].includes(event.key)) setInput("left", true);
      if (["ArrowRight", "d", "D"].includes(event.key)) setInput("right", true);
      if (["ArrowUp", "w", "W"].includes(event.key)) setInput("up", true);
      if (["ArrowDown", "s", "S"].includes(event.key)) setInput("down", true);
      if (event.key.startsWith("Arrow")) event.preventDefault();
    };
    const up = (event: KeyboardEvent) => {
      if (["ArrowLeft", "a", "A"].includes(event.key)) setInput("left", false);
      if (["ArrowRight", "d", "D"].includes(event.key)) setInput("right", false);
      if (["ArrowUp", "w", "W"].includes(event.key)) setInput("up", false);
      if (["ArrowDown", "s", "S"].includes(event.key)) setInput("down", false);
    };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    let start = performance.now();
    let previous = start;
    const player = { x: 0.5, depth: 0, targetDepth: 0, vx: 0, vy: 0, angle: 0 };
    const rivals = [
      { x: 0.25, depth: 8, speed: 4.8, name: selectedCharacter === "mia" ? "Alex" : "Mia", color: "#ff5a80" },
      { x: 0.76, depth: 4, speed: 4.25, name: "Robo", color: "#40d8ff" },
    ];
    const drill = (drills.find((item) => item.id === selectedDrill) ?? drills[0])!;
    const char = (characters.find((item) => item.id === selectedCharacter) ?? characters[0])!;
    const stats: GameStats = { score: 0, stars: 0, gems: 0, depth: 0, combo: 1, time: 60 };
    type Pickup = { id: number; x: number; worldDepth: number; kind: "star" | "gem" };
    const pickups: Pickup[] = [];
    let pickupSeq = 0;
    let spawnCursor = 6;
    let spawnCount = 0;
    const spawnPickups = (aheadTo: number, edgeAmount: number) => {
      while (spawnCursor < aheadTo) {
        spawnCount += 1;
        pickups.push({
          id: pickupSeq++,
          x: edgeAmount + Math.random() * (1 - edgeAmount * 2),
          worldDepth: spawnCursor,
          kind: spawnCount % 4 === 0 ? "gem" : "star",
        });
        spawnCursor += 7 + Math.random() * 4;
      }
    };
    let alarmed = false;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(rect.width * ratio);
      canvas.height = Math.floor(rect.height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const rounded = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
    };
    const drawCrystal = (x: number, y: number, color: string, size: number) => {
      ctx.save(); ctx.translate(x, y); ctx.shadowColor = color; ctx.shadowBlur = 14; ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size * .7, -size * .25); ctx.lineTo(size * .45, size); ctx.lineTo(-size * .45, size); ctx.lineTo(-size * .7, -size * .25); ctx.closePath(); ctx.fill(); ctx.restore();
    };
    const drawDrill = (x: number, y: number, color: string, label: string, isPlayer = false, angle = 0) => {
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = "rgba(2,10,22,.5)"; ctx.beginPath(); ctx.ellipse(0, 23, 39, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.rotate(angle);
      if (isPlayer) { ctx.shadowColor = "#ffc400"; ctx.shadowBlur = 18; }
      ctx.fillStyle = color; rounded(-34, -15, 54, 35, 10);
      ctx.fillStyle = "#10203a"; rounded(-28, 12, 48, 14, 6);
      ctx.fillStyle = "#a9dfff"; rounded(-8, -28, 24, 18, 6);
      ctx.fillStyle = "#e6edf5"; ctx.beginPath(); ctx.moveTo(18, -13); ctx.lineTo(58, 3); ctx.lineTo(18, 19); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#71839a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(27, -8); ctx.lineTo(46, 13); ctx.moveTo(27, 14); ctx.lineTo(47, -6); ctx.stroke();
      ctx.restore();
      ctx.shadowBlur = 0; ctx.fillStyle = isPlayer ? "#ffc400" : "#07182f"; rounded(-28, -48, 56, 17, 8);
      ctx.fillStyle = isPlayer ? "#10203a" : "#f4f8ff"; ctx.font = "800 10px Arial"; ctx.textAlign = "center"; ctx.fillText(label.toUpperCase(), 0, -36); ctx.restore();
    };

    const draw = (now: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const dt = Math.min((now - previous) / 1000, .05);
      previous = now;
      const edge = Math.min(0.42, 68 / Math.max(w, 1));
      if (!paused) {
        const elapsed = (now - start) / 1000;
        stats.time = Math.max(0, 60 - elapsed);
        const input = keys.current;
        const keyH = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        const keyV = (input.down ? 1 : 0) - (input.up ? 1 : 0);
        const horizontal = Math.max(-1, Math.min(1, keyH + stick.current.x));
        const vertical = Math.max(-1, Math.min(1, keyV + stick.current.y));
        // smooth steering: accelerate toward the requested direction, ease back to rest
        const accel = 5.4 + drill.speed * .5;
        player.vx += (horizontal * (.2 + drill.speed * .018) - player.vx) * Math.min(1, dt * accel);
        player.vy += (vertical * (7 + drill.power * 1.1) - player.vy) * Math.min(1, dt * (accel * .8));
        player.x = Math.max(edge, Math.min(1 - edge, player.x + player.vx * dt));
        if (player.x <= edge || player.x >= 1 - edge) player.vx *= .25;
        player.targetDepth = Math.max(0, player.targetDepth + player.vy * dt);
        player.depth += (player.targetDepth - player.depth) * Math.min(1, dt * 6);
        const idle = Math.abs(horizontal) < .08 && Math.abs(vertical) < .08;
        if (idle) player.targetDepth += dt * 2.1;
        const targetAngle = Math.max(-.75, Math.min(.75, Math.atan2(vertical * .9, Math.abs(horizontal) < .05 ? 1.6 : Math.abs(horizontal) * 1.6) * (horizontal < 0 ? -1 : 1) * (Math.abs(horizontal) < .05 ? Math.sign(vertical) || 0 : 1)));
        player.angle += (targetAngle - player.angle) * Math.min(1, dt * 7);
        setDrillIntensity(Math.min(1, Math.abs(player.vy) / 9 + Math.abs(player.vx) * 1.6));
        rivals.forEach((rival, index) => { rival.depth += dt * rival.speed * (index ? .95 : 1.05) + Math.sin(now / 900 + index) * dt; rival.x += Math.sin(now / 1400 + index * 3) * dt * .015; rival.x = Math.max(edge, Math.min(1 - edge, rival.x)); });
        spawnPickups(player.depth + 60, edge);
        for (let i = pickups.length - 1; i >= 0; i--) {
          const pickup = pickups[i]!;
          const depthDelta = pickup.worldDepth - player.depth;
          if (depthDelta < -6) {
            // scrolled past uncollected — chain broken
            pickups.splice(i, 1);
            stats.combo = 1;
            continue;
          }
          const xDelta = Math.abs(pickup.x - player.x);
          if (Math.abs(depthDelta) < 3.5 && xDelta < 0.055) {
            pickups.splice(i, 1);
            const gem = pickup.kind === "gem";
            stats.stars += gem ? 0 : 1;
            stats.gems += gem ? 1 : 0;
            stats.combo = Math.min(8, stats.combo + 1);
            stats.score += gem ? 100 : 10 * stats.combo;
            if (gem) sfx.gem(); else sfx.star();
          }
        }
        stats.depth = Math.floor(player.depth);
        if (stats.time <= 10 && !alarmed) { alarmed = true; sfx.alarm(); }
        if (Math.floor(now / 250) % 2 === 0) onStats({ ...stats });
        if (stats.time <= 0 && !finishRef.current) { finishRef.current = true; setDrillIntensity(0); onFinish({ ...stats }); return; }
      } else {
        start += now - previous;
        setDrillIntensity(0);
      }

      const zone = player.depth > 140 ? "volcanic" : player.depth > 72 ? "crystal" : "dirt";
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      if (zone === "volcanic") { gradient.addColorStop(0, "#351122"); gradient.addColorStop(1, "#7b1a11"); }
      else if (zone === "crystal") { gradient.addColorStop(0, "#101b46"); gradient.addColorStop(1, "#241350"); }
      else { gradient.addColorStop(0, "#4b2b1d"); gradient.addColorStop(1, "#241713"); }
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);

      const tile = 58;
      const offset = (player.depth * 5) % tile;
      for (let row = -1; row < h / tile + 2; row++) {
        for (let col = 0; col < w / tile + 1; col++) {
          const hash = (row * 43 + col * 97 + Math.floor(player.depth / 12) * 19) % 17;
          const x = col * tile; const y = row * tile - offset;
          ctx.fillStyle = hash % 3 ? "rgba(255,255,255,.035)" : "rgba(0,0,0,.11)";
          ctx.strokeStyle = "rgba(255,255,255,.055)"; ctx.lineWidth = 1; rounded(x + 2, y + 2, tile - 4, tile - 4, 10); ctx.strokeRect(x + 3, y + 3, tile - 6, tile - 6);
          if (zone === "volcanic" && hash === 11) { ctx.fillStyle = "#ff3d16"; rounded(x + 5, y + 39, tile - 10, 12, 6); }
        }
      }
      for (let i = 0; i < 26; i++) {
        const px = (i * 89 + now / 8) % w; const py = (i * 137 + now / 14) % h;
        ctx.fillStyle = i % 3 ? "rgba(255,198,70,.35)" : "rgba(64,218,255,.32)"; ctx.fillRect(px, py, 3, 3);
      }
      const playerY = h * .54;
      pickups.forEach((pickup) => {
        const py = playerY + (pickup.worldDepth - player.depth) * 5;
        if (py < -40 || py > h + 40) return;
        const px = pickup.x * w;
        const bob = Math.sin(now / 260 + pickup.id) * 4;
        if (pickup.kind === "gem") {
          drawCrystal(px, py + bob, zone === "volcanic" ? "#ff6b24" : "#35ddff", 13);
        } else {
          ctx.save();
          ctx.shadowColor = "#ffd12a"; ctx.shadowBlur = 10;
          ctx.fillStyle = "#ffd12a"; ctx.font = "26px serif"; ctx.textAlign = "center";
          ctx.fillText("★", px, py + bob + 8);
          ctx.restore();
        }
      });
      rivals.forEach((rival, index) => drawDrill(rival.x * w, playerY + (rival.depth - player.depth) * 5 + (index ? 150 : -130), rival.color, rival.name));
      drawDrill(player.x * w, playerY, selectedDrill === "speed" ? "#ff5578" : selectedDrill === "power" ? "#31bff1" : "#f0a712", `YOU · ${char.name}`, true, player.angle);
      if (stats.time <= 10) {
        ctx.fillStyle = "rgba(255,35,19,.16)"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "900 64px Impact, sans-serif"; ctx.fillText(String(Math.ceil(stats.time)), w / 2, h * .38);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); setDrillIntensity(0); };
  }, [onFinish, onStats, paused, selectedCharacter, selectedDrill, soundOn]);

  return (
    <>
      <canvas ref={canvasRef} className="game-canvas" aria-label="Drill War mine" />
      <Joystick onVector={(x, y) => { stick.current.x = x; stick.current.y = y; }} />
    </>
  );
}


export function DrillWarGame() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [character, setCharacter] = useState<CharacterId>("alex");
  const [drill, setDrill] = useState<DrillId>("mini");
  const [countdown, setCountdown] = useState(3);
  const [paused, setPaused] = useState(false);
  const [sound, setSound] = useState(true);
  const [stats, setStats] = useState<GameStats>({ score: 0, stars: 0, gems: 0, depth: 0, combo: 1, time: 60 });

  useEffect(() => { setSoundEnabled(sound); }, [sound]);

  useEffect(() => {
    if (screen !== "countdown") return;
    setCountdown(3);
    sfx.countdown();
    let value = 3;
    const timer = window.setInterval(() => {
      value -= 1;
      if (value <= 0) { window.clearInterval(timer); sfx.go(); setScreen("game"); }
      else { setCountdown(value); sfx.countdown(); }
    }, 850);
    return () => window.clearInterval(timer);
  }, [screen]);

  useEffect(() => { if (screen === "results") sfx.win(); }, [screen]);

  const finishGame = useCallback((finalStats: GameStats) => { setStats(finalStats); setScreen("results"); setPaused(false); }, []);
  const updateStats = useCallback((next: GameStats) => setStats(next), []);
  const go = useCallback((next: Screen, sound: () => void = sfx.click) => { unlockAudio(); sound(); setScreen(next); }, []);
  const begin = () => go("character", sfx.select);

  if (screen === "game") {
    const leaderboard = [
      { name: "YOU", score: stats.score },
      { name: character === "mia" ? "ALEX" : "MIA", score: Math.floor(stats.depth * 8.8 + 220) },
      { name: "ROBO", score: Math.floor(stats.depth * 7.5 + 180) },
    ].sort((a, b) => b.score - a.score);
    return (
      <main className="game-screen">
        <GameCanvas selectedCharacter={character} selectedDrill={drill} paused={paused} soundOn={sound} onStats={updateStats} onFinish={finishGame} />

        <div className="hud" aria-live="polite">
          <div className="hud-player"><span>{characters.find((c) => c.id === character)?.icon}</span><div><small>YOU · {character}</small><strong>{stats.score.toLocaleString()}</strong></div></div>
          <div className={`hud-timer ${stats.time <= 10 ? "danger" : ""}`}><small>TIME</small><strong>00:{Math.ceil(stats.time).toString().padStart(2, "0")}</strong></div>
          <div className="leaderboard"><small><Trophy /> LEADERBOARD</small>{leaderboard.map((entry, index) => <div key={entry.name}><b>{index + 1}</b><span>{entry.name}</span><strong>{entry.score}</strong></div>)}</div>
          <div className="hud-depth"><small>DEPTH</small><strong>{stats.depth}m</strong></div>
          <div className="hud-pickups"><span><Star /> {stats.stars}</span><span><Gem /> {stats.gems}</span></div>
          <div className="zone-badge">{stats.depth > 140 ? "VOLCANIC CORE" : stats.depth > 72 ? "CRYSTAL CAVE" : "DEEP DIRT"}</div>
          <Button variant="control" size="iconGame" className="pause-button" aria-label="Pause game" onClick={() => { sfx.pause(); setPaused(true); }}><Pause /></Button>
        </div>
        {stats.time <= 10 && <div className="collapse-banner"><strong>CAVE COLLAPSE!</strong><span>Keep drilling — rocks are falling!</span></div>}
        {paused && <div className="modal-scrim"><div className="game-modal"><span className="modal-icon">⛏️</span><h2>PAUSED</h2><p>Catch your breath. The treasure will wait.</p><Button variant="arcade" size="xl" onClick={() => { sfx.click(); setPaused(false); }}><Play /> Resume</Button><Button variant="metal" size="lg" onClick={() => { setPaused(false); go("menu", sfx.back); }}><Home /> Quit to menu</Button></div></div>}
      </main>
    );
  }

  return (
    <main className="arcade-shell">
      <img src={menuArt} width={1536} height={1024} alt="Three Drill War racers charging through a crystal cavern" className="menu-art" />
      <div className="art-vignette" />
      {screen === "menu" && <section className="menu-stage"><Brand /><p className="tagline">DIG DEEP <i /> COLLECT <i /> CONQUER</p><div className="menu-actions"><Button variant="arcade" size="hero" onClick={begin}><Play /> Start game</Button><div><Button variant="metal" size="lg" onClick={() => go("howto")}><BookOpen /> How to play</Button><Button variant="metal" size="lg" onClick={() => go("settings")}><Settings /> Settings</Button></div></div><span className="version">ARCADE EDITION · v1.0</span></section>}

      {screen === "howto" && <section className="panel-screen"><div className="panel-top"><Brand compact /><Button variant="control" size="iconGame" onClick={() => go("menu")} aria-label="Back to menu"><Home /></Button></div><h1>HOW TO PLAY</h1><div className="howto-grid">
        <article><span className="key-cluster">W<br />A S D</span><h3>Move & drill</h3><p>Use WASD, arrow keys, or the on-screen joystick to steer and dig.</p></article>
        <article><span className="how-icon">⭐ 💎</span><h3>Grab treasure</h3><p>Chain pickups to grow your combo and rocket up the leaderboard.</p></article>
        <article><span className="how-icon">⚡ 🧲</span><h3>Use power-ups</h3><p>Turbo, magnets, mega drills and shields turn the race around.</p></article>
        <article><span className="how-icon">💣 🔥</span><h3>Dodge danger</h3><p>Hard rock, bombs, bats and lava will slow down your run.</p></article>
      </div><div className="tip-strip"><Zap /> The final 10 seconds trigger a cave collapse. Keep moving!</div><Button variant="arcade" size="xl" onClick={() => go("menu")}><Home /> Back to menu</Button></section>}

      {screen === "settings" && <section className="panel-screen settings-panel"><div className="panel-top"><Brand compact /><Button variant="control" size="iconGame" onClick={() => go("menu")} aria-label="Back to menu"><Home /></Button></div><h1>SETTINGS</h1><div className="settings-list"><button className="setting-control" onClick={() => { unlockAudio(); setSound((value) => { setSoundEnabled(!value); if (!value) sfx.click(); return !value; }); }}><span>{sound ? <Volume2 /> : <VolumeX />}</span><div><strong>Sound effects</strong><small>Drills, gems, hazards and countdowns</small></div><i className={sound ? "toggle active" : "toggle"} /></button><div className="setting-control"><span><Gauge /></span><div><strong>Game speed</strong><small>Arcade — fast, fair and competitive</small></div><b>ARCADE</b></div></div><Button variant="arcade" size="xl" onClick={() => go("menu")}><Home /> Done</Button></section>}

      {screen === "character" && <section className="panel-screen selection-screen"><div className="panel-top"><Brand compact /><span className="step">STEP 1 OF 2</span></div><h1>CHOOSE YOUR DRILLER</h1><p className="screen-subtitle">Every racer has a different edge underground.</p><div className="selection-grid">{characters.map((item) => <button key={item.id} className={`select-card ${character === item.id ? "selected" : ""}`} onClick={() => { sfx.select(); setCharacter(item.id); }}><span className={`character-portrait ${item.color}`}>{item.icon}</span><h2>{item.name}</h2><p>{item.trait}</p><strong>{item.perk}</strong><span className="selected-label">{character === item.id ? "SELECTED" : "SELECT"}</span></button>)}</div><div className="selection-actions"><Button variant="metal" size="lg" onClick={() => go("menu")}><ArrowLeft /> Back</Button><Button variant="arcade" size="xl" onClick={() => go("drill")}>Choose drill <ArrowRight /></Button></div></section>}

      {screen === "drill" && <section className="panel-screen selection-screen"><div className="panel-top"><Brand compact /><span className="step">STEP 2 OF 2</span></div><h1>CHOOSE YOUR DRILL</h1><p className="screen-subtitle">Pick a machine built for your racing style.</p><div className="selection-grid">{drills.map((item) => <button key={item.id} className={`select-card drill-card ${drill === item.id ? "selected" : ""}`} onClick={() => { sfx.select(); setDrill(item.id); }}><span className="drill-portrait">{item.icon}</span><h2>{item.name}</h2><p>{item.trait}</p><div className="drill-stats"><label>Speed <StatPips value={item.speed} /></label><label>Power <StatPips value={item.power} /></label><label>Control <StatPips value={item.control} /></label></div><span className="selected-label">{drill === item.id ? "SELECTED" : "SELECT"}</span></button>)}</div><div className="selection-actions"><Button variant="metal" size="lg" onClick={() => go("character")}><ArrowLeft /> Back</Button><Button variant="arcade" size="xl" onClick={() => go("countdown")}><Play /> Start race</Button></div></section>}

      {screen === "countdown" && <section className="countdown-stage"><p>GET READY!</p><strong key={countdown}>{countdown}</strong><span>{characters.find((c) => c.id === character)?.name} · {drills.find((d) => d.id === drill)?.name}</span></section>}

      {screen === "results" && <section className="panel-screen results-screen"><Brand compact /><div className="winner-title"><Trophy /><div><small>EXPEDITION COMPLETE</small><h1>YOU WIN!</h1></div></div><div className="result-score"><span>{characters.find((c) => c.id === character)?.icon}</span><div><small>FINAL SCORE</small><strong>{stats.score.toLocaleString()}</strong></div></div><div className="result-stats"><div><Star /><strong>{stats.stars}</strong><small>Stars</small></div><div><Gem /><strong>{stats.gems}</strong><small>Gems</small></div><div><ArrowDown /><strong>{stats.depth}m</strong><small>Depth</small></div><div><Zap /><strong>x{stats.combo}</strong><small>Best combo</small></div></div><div className="final-board"><h3>FINAL LEADERBOARD</h3><div className="winner-row"><b>1</b><span>YOU · {character.toUpperCase()}</span><strong>{stats.score.toLocaleString()}</strong></div><div><b>2</b><span>MIA</span><strong>{Math.floor(stats.depth * 8.1 + 170)}</strong></div><div><b>3</b><span>ROBO</span><strong>{Math.floor(stats.depth * 6.9 + 130)}</strong></div></div><div className="selection-actions"><Button variant="arcade" size="xl" onClick={() => go("countdown")}><RotateCcw /> Race again</Button><Button variant="metal" size="lg" onClick={() => go("drill")}><Settings /> Change drill</Button></div></section>}
    </main>
  );
}