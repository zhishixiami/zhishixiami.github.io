/*
 * 爱情闯关跑 —— 内嵌跑酷小游戏
 * 操作：空格 / ↑ / W / 点击或触摸屏幕 跳跃（可二段跳）
 * 障碍物 = 各种恋爱/生活难题，跳过去就赢
 */
(function () {
    'use strict';

    var canvas = document.getElementById('runner-canvas');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');

    /* ---------------- 难题池（障碍物） ---------------- */
    var PUZZLES = [
        { label: '异地',   color: '#8d9bd8', icon: '✈', h: 52, tip: '心在一起，多远都不是距离' },
        { label: '小误会', color: '#f2a3ad', icon: '✉', h: 46, tip: '误会说开就好，抱一下别冷战' },
        { label: '考试周', color: '#f0c05a', icon: '书', h: 60, tip: '熬过考试周，陪你去吃好的' },
        { label: '加班',   color: '#9fc4e8', icon: '勤', h: 50, tip: '加班再晚，也有人等你回家' },
        { label: '熬夜',   color: '#8a97b5', icon: '月', h: 44, tip: '早点睡，梦里也有我' },
        { label: '吵架',   color: '#e89a8a', icon: '火', h: 52, tip: '吵归吵，手还是要牵的' },
        { label: '生病',   color: '#a8d5c0', icon: '药', h: 46, tip: '乖乖吃药，我来照顾你' },
        { label: '距离',   color: '#c3a9e8', icon: '道', h: 54, tip: '跨越屏幕，也要奔向你' }
    ];

    /* ---------------- 游戏状态 ---------------- */
    var W = 900, H = 420;          // 逻辑尺寸
    var GROUND = H - 58;           // 地面 y
    var GRAV = 0.6, JUMP_V = -13.5, MAX_JUMP = 2;
    var state = 'ready';           // ready | play | over
    var player = { x: 78, y: GROUND - 58, w: 46, h: 58, vy: 0, onGround: true, jumps: 0, run: 0 };
    var obstacles = [];
    var clouds = [];
    var hearts = [];
    var speed = 5, baseSpeed = 5;
    var distance = 0, score = 0, combo = 0, best = 0;
    var spawnTimer = 55;
    var overPuzzle = null;
    var raf = null, lastT = 0;

    try { best = parseInt(localStorage.getItem('loveRunnerBest') || '0', 10) || 0; } catch (e) {}

    /* ---------------- 音效（WebAudio） ---------------- */
    var AC = null;
    function ensureAudio() {
        if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
        if (AC && AC.state === 'suspended') { AC.resume(); }
    }
    function tone(freq, dur, type, vol, slideTo) {
        if (!AC) return;
        var o = AC.createOscillator(), g = AC.createGain();
        o.type = type || 'square';
        o.frequency.value = freq;
        if (slideTo) { o.frequency.exponentialRampToValueAtTime(slideTo, AC.currentTime + dur); }
        g.gain.setValueAtTime(vol || 0.05, AC.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
        o.connect(g); g.connect(AC.destination);
        o.start(); o.stop(AC.currentTime + dur);
    }
    function sfxJump()   { tone(420, 0.12, 'square', 0.05, 760); }
    function sfxDouble() { tone(520, 0.12, 'square', 0.05, 950); }
    function sfxScore()  { tone(880, 0.09, 'sine', 0.05); setTimeout(function(){ tone(1100,0.09,'sine',0.04); }, 60); }
    function sfxHit()    { tone(220, 0.3, 'sawtooth', 0.08, 60); }

    /* ---------------- 工具函数 ---------------- */
    function rr(ctx, x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }
    function heartPath(ctx, x, y, s) {
        ctx.beginPath();
        ctx.moveTo(x, y + s * 0.35);
        ctx.bezierCurveTo(x, y, x - s, y, x - s, y + s * 0.35);
        ctx.bezierCurveTo(x - s, y + s * 0.7, x - s * 0.4, y + s * 1.1, x, y + s * 1.35);
        ctx.bezierCurveTo(x + s * 0.4, y + s * 1.1, x + s, y + s * 0.7, x + s, y + s * 0.35);
        ctx.bezierCurveTo(x + s, y, x, y, x, y + s * 0.35);
        ctx.closePath();
    }

    /* ---------------- 尺寸自适应 ---------------- */
    function resize() {
        // 显示尺寸完全由 CSS wrapper（padding-top固定比例）控制，这里只读取实际尺寸设置内部分辨率
        var rect = canvas.getBoundingClientRect();
        var cssW = rect.width;
        var cssH = rect.height;
        if (!cssW || cssW < 50) {
            // 隐藏时用父容器宽度估算
            var parent = canvas.parentElement;
            cssW = (parent && parent.clientWidth) || 800;
            cssH = cssW * (H / W);
        }
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.round(cssW * dpr));
        canvas.height = Math.max(1, Math.round(cssH * dpr));
    }
    var dpr = 1;

    /* ---------------- 重置 ---------------- */
    function reset() {
        player.y = GROUND - player.h; player.vy = 0; player.onGround = true; player.jumps = 0; player.run = 0;
        obstacles = []; clouds = []; hearts = [];
        speed = baseSpeed; distance = 0; score = 0; combo = 0; overPuzzle = null;
        spawnTimer = 55;
        for (var i = 0; i < 4; i++) makeCloud(true);
        for (var i = 0; i < 6; i++) makeHeart(true);
    }
    function makeCloud(anywhere) {
        clouds.push({
            x: Math.random() * W,
            y: 40 + Math.random() * 130,
            s: 0.6 + Math.random() * 0.9,
            v: 0.2 + Math.random() * 0.4
        });
    }
    function makeHeart(anywhere) {
        hearts.push({
            x: Math.random() * W,
            y: anywhere ? Math.random() * H : -20,
            s: 4 + Math.random() * 5,
            v: 1 + Math.random() * 1.6
        });
    }

    /* ---------------- 生成障碍物 ---------------- */
    function spawnObstacle() {
        var pz = PUZZLES[Math.floor(Math.random() * PUZZLES.length)];
        var wob = 0.85 + Math.random() * 0.3;
        obstacles.push({
            x: W + 30,
            w: 42,
            h: Math.round(pz.h * wob),
            pz: pz
        });
    }

    /* ---------------- 开始 / 跳跃 / 结束 ---------------- */
    function startGame() {
        ensureAudio();
        reset();
        state = 'play';
    }
    function jump() {
        if (state !== 'play') return;
        if (player.jumps < MAX_JUMP) {
            player.vy = JUMP_V;
            player.onGround = false;
            player.jumps++;
            if (player.jumps > 1) { sfxDouble(); } else { sfxJump(); }
        }
    }
    function gameOver(pz) {
        state = 'over';
        overPuzzle = pz;
        if (score > best) { best = score; try { localStorage.setItem('loveRunnerBest', String(best)); } catch (e) {} }
        sfxHit();
    }

    /* ---------------- 更新 ---------------- */
    function update() {
        if (state === 'ready' || state === 'over') return;

        // 玩家物理
        player.vy += GRAV;
        player.y += player.vy;
        player.run += 0.28;
        if (player.y >= GROUND - player.h) {
            player.y = GROUND - player.h;
            player.vy = 0; player.onGround = true; player.jumps = 0;
        }

        // 云
        for (var i = clouds.length - 1; i >= 0; i--) {
            clouds[i].x -= clouds[i].v;
            if (clouds[i].x < -80) { clouds.splice(i, 1); makeCloud(false); }
        }
        // 飘落爱心
        for (var j = hearts.length - 1; j >= 0; j--) {
            hearts[j].y += hearts[j].v;
            if (hearts[j].y > H + 20) { hearts.splice(j, 1); makeHeart(false); }
        }

        // 生成障碍物
        spawnTimer -= 1;
        if (spawnTimer <= 0) {
            spawnObstacle();
            var gap = Math.max(55, 120 - Math.floor(distance / 40));
            spawnTimer = gap + Math.floor(Math.random() * 40);
        }

        // 障碍物移动 + 得分
        for (var k = obstacles.length - 1; k >= 0; k--) {
            var o = obstacles[k];
            o.x -= speed;
            // 跳过得分（障碍物完全越过玩家）
            if (!o.scored && o.x + o.w < player.x) {
                o.scored = true;
                combo++;
                score += 10 + combo * 2;
                sfxScore();
            }
            // 移出屏幕
            if (o.x + o.w < -20) { obstacles.splice(k, 1); continue; }
            // 碰撞检测
            var px = player.x + 7, py = player.y + 9, pw = player.w - 14, ph = player.h - 12;
            var ox = o.x + 3, oy = GROUND - o.h + 5, ow = o.w - 6, oh = o.h - 5;
            if (px < ox + ow && px + pw > ox && py < oy + oh && py + ph > oy) {
                gameOver(o.pz);
                return;
            }
        }

        // 距离 & 难度
        distance += speed * 0.05;
        if (Math.floor(score / 50) > Math.floor((score - speed) / 50)) { /* 无 */ }
        speed = baseSpeed + Math.min(6, Math.floor(score / 60) * 0.6);
    }

    /* ---------------- 绘制 ---------------- */
    function draw() {
        ctx.clearRect(0, 0, W, H);
        // 背景
        var g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#fff0f1');
        g.addColorStop(0.6, '#ffe3e0');
        g.addColorStop(1, '#ffd6d3');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        // 远处山丘
        ctx.fillStyle = 'rgba(240,180,180,0.35)';
        ctx.beginPath(); ctx.ellipse(150, GROUND, 240, 70, 0, Math.PI, 0); ctx.fill();
        ctx.beginPath(); ctx.ellipse(700, GROUND, 300, 90, 0, Math.PI, 0); ctx.fill();

        // 云
        for (var i = 0; i < clouds.length; i++) {
            var c = clouds[i];
            ctx.fillStyle = 'rgba(255,255,255,0.75)';
            ctx.beginPath();
            ctx.arc(c.x, c.y, 18 * c.s, 0, Math.PI * 2);
            ctx.arc(c.x + 20 * c.s, c.y - 8 * c.s, 14 * c.s, 0, Math.PI * 2);
            ctx.arc(c.x + 38 * c.s, c.y, 17 * c.s, 0, Math.PI * 2);
            ctx.fill();
        }

        // 飘落爱心
        for (var j = 0; j < hearts.length; j++) {
            var hx = hearts[j];
            ctx.fillStyle = 'rgba(224,74,90,0.4)';
            heartPath(ctx, hx.x, hx.y, hx.s);
            ctx.fill();
        }

        // 地面
        ctx.fillStyle = '#f6c7c2';
        ctx.fillRect(0, GROUND, W, H - GROUND);
        ctx.fillStyle = '#f0b8b2';
        ctx.fillRect(0, GROUND, W, 4);
        // 跑道短线
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 3;
        for (var s = (distance * 8) % 60; s < W; s += 60) {
            ctx.beginPath(); ctx.moveTo(s, GROUND + 24); ctx.lineTo(s + 26, GROUND + 24); ctx.stroke();
        }
        // 小草
        ctx.strokeStyle = 'rgba(160,190,140,0.7)';
        ctx.lineWidth = 2;
        for (var gs = 0; gs < W; gs += 46) {
            var gx = gs + ((distance * 4) % 46);
            ctx.beginPath(); ctx.moveTo(gx, GROUND); ctx.lineTo(gx - 4, GROUND - 8); ctx.lineTo(gx + 1, GROUND - 12); ctx.lineTo(gx + 6, GROUND - 7); ctx.stroke();
        }

        // 障碍物
        for (var k = 0; k < obstacles.length; k++) drawObstacle(obstacles[k]);

        // 玩家
        drawPlayer();

        // HUD
        drawHUD();

        // 遮罩（ready / over）
        if (state === 'ready') drawReady();
        else if (state === 'over') drawOver();
    }

    function drawObstacle(o) {
        var x = o.x, y = GROUND - o.h, w = o.w, h = o.h, pz = o.pz;
        // 影子
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.beginPath(); ctx.ellipse(x + w / 2, GROUND + 4, w * 0.7, 6, 0, 0, Math.PI * 2); ctx.fill();
        // 主体
        ctx.fillStyle = pz.color;
        rr(ctx, x, y, w, h, 8); ctx.fill();
        // 高光
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        rr(ctx, x + 4, y + 3, w - 12, h * 0.45, 6); ctx.fill();
        // 图标
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = 'bold 18px "Ma Shan Zheng","微软雅黑",sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(pz.icon, x + w / 2, y + h * 0.32);
        // 难题文字
        ctx.font = 'bold 16px "Ma Shan Zheng","微软雅黑",sans-serif';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(90,40,45,0.8)';
        ctx.strokeText(pz.label, x + w / 2, y + h * 0.66);
        ctx.fillStyle = '#fff';
        ctx.fillText(pz.label, x + w / 2, y + h * 0.66);
        ctx.textBaseline = 'alphabetic';
    }

    function drawPlayer() {
        var p = player, x = p.x + p.w / 2, y = p.y;
        var leg = Math.sin(p.run) * 7;
        // 影子
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath(); ctx.ellipse(x, GROUND + 4, 24, 6, 0, 0, Math.PI * 2); ctx.fill();
        // 腿
        ctx.strokeStyle = '#7a4a3a'; ctx.lineWidth = 7; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - 8, y + p.h - 8); ctx.lineTo(x - 9 + leg, y + p.h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + 8, y + p.h - 8); ctx.lineTo(x + 9 - leg, y + p.h); ctx.stroke();
        // 鞋
        ctx.fillStyle = '#e04a5a';
        rr(ctx, x - 17 + leg, y + p.h - 3, 14, 6, 3); ctx.fill();
        rr(ctx, x + 3 - leg, y + p.h - 3, 14, 6, 3); ctx.fill();
        // 身体（粉色卫衣）
        ctx.fillStyle = '#f58fa0';
        rr(ctx, x - 16, y + p.h - 34, 32, 30, 9); ctx.fill();
        // 衣领
        ctx.fillStyle = '#ec7f93';
        ctx.beginPath(); ctx.moveTo(x - 8, y + p.h - 34); ctx.lineTo(x, y + p.h - 26); ctx.lineTo(x + 8, y + p.h - 34); ctx.closePath(); ctx.fill();
        // 肚兜
        ctx.fillStyle = '#fff3f4';
        rr(ctx, x - 6, y + p.h - 22, 12, 18, 4); ctx.fill();
        // 手臂
        ctx.strokeStyle = '#f58fa0'; ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - 15, y + p.h - 28); ctx.lineTo(x - 23, y + p.h - 12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + 15, y + p.h - 28); ctx.lineTo(x + 23, y + p.h - 12); ctx.stroke();
        // 手
        ctx.fillStyle = '#ffd9b8';
        ctx.beginPath(); ctx.arc(x - 24, y + p.h - 11, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 24, y + p.h - 11, 3.5, 0, Math.PI * 2); ctx.fill();
        // 头
        ctx.fillStyle = '#ffd9b8';
        ctx.beginPath(); ctx.arc(x, y + 9, 15, 0, Math.PI * 2); ctx.fill();
        // 头发
        ctx.fillStyle = '#6b4226';
        ctx.beginPath(); ctx.arc(x, y + 5, 15, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
        rr(ctx, x - 15, y + 3, 30, 5, 3); ctx.fill();
        ctx.fillStyle = '#5a3520';
        ctx.beginPath(); ctx.arc(x - 8, y + 1, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 8, y + 1, 3, 0, Math.PI * 2); ctx.fill();
        // 眼睛
        ctx.fillStyle = '#3a2a22';
        ctx.beginPath(); ctx.arc(x - 5, y + 10, 2.3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 5, y + 10, 2.3, 0, Math.PI * 2); ctx.fill();
        // 腮红
        ctx.fillStyle = 'rgba(255,120,130,0.5)';
        ctx.beginPath(); ctx.arc(x - 11, y + 16, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 11, y + 16, 3, 0, Math.PI * 2); ctx.fill();
        // 嘴
        ctx.strokeStyle = '#a84a52'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y + 15, 4, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
        // 头顶小爱心
        ctx.fillStyle = '#e04a5a';
        heartPath(ctx, x, y - 10, 8);
        ctx.fill();
    }

    function drawHUD() {
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.font = 'bold 20px "Ma Shan Zheng","微软雅黑",sans-serif';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(90,40,45,0.6)';
        ctx.strokeText('得分 ' + score, 18, 14);
        ctx.fillStyle = '#c04852'; ctx.fillText('得分 ' + score, 18, 14);
        if (combo >= 2) {
            ctx.font = 'bold 18px "Ma Shan Zheng","微软雅黑",sans-serif';
            ctx.strokeText('连跳 x' + combo, 18, 44);
            ctx.fillStyle = '#e07a30'; ctx.fillText('连跳 x' + combo, 18, 44);
        }
        ctx.font = 'bold 18px "Ma Shan Zheng","微软雅黑",sans-serif';
        ctx.textAlign = 'right';
        ctx.strokeText('最佳 ' + best, W - 18, 16);
        ctx.fillStyle = '#8a5a62'; ctx.fillText('最佳 ' + best, W - 18, 16);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }

    function drawReady() {
        ctx.fillStyle = 'rgba(255,246,240,0.82)';
        rr(ctx, W / 2 - 210, 60, 420, 300, 22); ctx.fill();
        ctx.strokeStyle = 'rgba(192,72,82,0.35)'; ctx.lineWidth = 2;
        rr(ctx, W / 2 - 210, 60, 420, 300, 22); ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = 'bold 30px "Ma Shan Zheng","微软雅黑",sans-serif';
        ctx.fillStyle = '#c04852';
        ctx.fillText('爱情闯关跑', W / 2, 104);
        ctx.font = '18px "Ma Shan Zheng","微软雅黑",sans-serif';
        ctx.fillStyle = '#8a5a62';
        ctx.fillText('前方是各种难题，跳过去就赢啦！', W / 2, 152);
        ctx.fillStyle = '#a86a72';
        ctx.fillText('异地 · 小误会 · 考试周 · 加班', W / 2, 184);
        ctx.fillText('熬夜 · 吵架 · 生病 · 距离', W / 2, 212);
        ctx.font = 'bold 22px "Ma Shan Zheng","微软雅黑",sans-serif';
        ctx.fillStyle = '#e04a5a';
        ctx.fillText('按 空格 / 点击屏幕 开始', W / 2, 268);
        ctx.font = '14px "微软雅黑",sans-serif';
        ctx.fillStyle = '#b0898e';
        ctx.fillText('可二段跳，连续闯关有连击加成', W / 2, 306);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }

    function drawOver() {
        ctx.fillStyle = 'rgba(255,246,240,0.88)';
        rr(ctx, W / 2 - 210, 55, 420, 320, 22); ctx.fill();
        ctx.strokeStyle = 'rgba(192,72,82,0.35)'; ctx.lineWidth = 2;
        rr(ctx, W / 2 - 210, 55, 420, 320, 22); ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = 'bold 26px "Ma Shan Zheng","微软雅黑",sans-serif';
        ctx.fillStyle = '#c04852';
        ctx.fillText('被「' + (overPuzzle ? overPuzzle.label : '难题') + '」绊倒啦！', W / 2, 96);
        ctx.font = '18px "Ma Shan Zheng","微软雅黑",sans-serif';
        ctx.fillStyle = '#8a5a62';
        ctx.fillText(overPuzzle ? overPuzzle.tip : '没关系，一起跨过去', W / 2, 138);
        ctx.font = 'bold 26px "Ma Shan Zheng","微软雅黑",sans-serif';
        ctx.fillStyle = '#e04a5a';
        ctx.fillText('得分 ' + score, W / 2, 196);
        ctx.font = '18px "Ma Shan Zheng","微软雅黑",sans-serif';
        ctx.fillStyle = '#8a5a62';
        ctx.fillText('最佳 ' + best + ' · 闯过 ' + combo + ' 关', W / 2, 236);
        ctx.font = 'bold 22px "Ma Shan Zheng","微软雅黑",sans-serif';
        ctx.fillStyle = '#c04852';
        ctx.fillText('按 空格 / 点击屏幕 再来一局', W / 2, 300);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }

    /* ---------------- 主循环 ---------------- */
    function loop(t) {
        if (!lastT) lastT = t;
        var dt = Math.min(t - lastT, 40);
        lastT = t;
        update();
        draw();
        raf = requestAnimationFrame(loop);
    }

    /* ---------------- 交互 ---------------- */
    function visible() {
        var r = canvas.getBoundingClientRect();
        return r.bottom > 0 && r.top < (window.innerHeight || document.documentElement.clientHeight);
    }
    function onKey(e) {
        if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
            if (!visible()) return;
            e.preventDefault();
            if (state === 'ready') startGame();
            else if (state === 'play') jump();
            else if (state === 'over') startGame();
        }
    }
    function onPointer(e) {
        if (state === 'ready') startGame();
        else if (state === 'play') jump();
        else if (state === 'over') startGame();
    }

    /* ---------------- 供外部调用：爱情树长成后淡入游戏 ---------------- */
    window.showLoveRunner = function () {
        var el = document.getElementById('love-runner');
        if (!el) return;
        el.style.display = 'block';
        el.classList.add('in');
        // 多次校准尺寸，确保布局稳定后 canvas 撑满父容器
        setTimeout(function () { resize(); }, 60);
        setTimeout(function () { resize(); }, 300);
        setTimeout(function () { resize(); }, 800);
    };

    /* ---------------- 初始化 ---------------- */
    resize();
    window.addEventListener('resize', resize);
    // 页面完全加载后再校准一次尺寸（防止字体/图片加载导致重排）
    window.addEventListener('load', function () { resize(); });
    // 监听容器尺寸变化，自动适配
    if (window.ResizeObserver) {
        var ro = new ResizeObserver(function () { resize(); });
        ro.observe(canvas);
    }
    document.addEventListener('keydown', onKey);
    canvas.addEventListener('pointerdown', onPointer);
    canvas.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
    reset();
    loop(0);
})();
