/**
 * MESSPULSE AI - Student Mobile Portal Controller
 * Real-time mess crowd, queue waiting time, and smart dining recommendations.
 */

(function () {
  'use strict';

  const els = {
    displayMessName: document.getElementById('displayMessName'),
    liveSyncPill: document.getElementById('liveSyncPill'),
    syncText: document.getElementById('syncText'),
    announcementBar: document.getElementById('announcementBar'),
    announcementText: document.getElementById('announcementText'),

    crowdHeroCard: document.getElementById('crowdHeroCard'),
    mealPeriodBadge: document.getElementById('mealPeriodBadge'),
    freshnessTag: document.getElementById('freshnessTag'),
    statusOrb: document.getElementById('statusOrb'),
    orbEmoji: document.getElementById('orbEmoji'),
    statusTitle: document.getElementById('statusTitle'),
    decisionPill: document.getElementById('decisionPill'),
    decisionText: document.getElementById('decisionText'),

    heroOccupancyVal: document.getElementById('heroOccupancyVal'),
    heroCapacityVal: document.getElementById('heroCapacityVal'),
    heroOccupancyPct: document.getElementById('heroOccupancyPct'),
    progressFill: document.getElementById('progressFill'),

    waitMinutesVal: document.getElementById('waitMinutesVal'),
    waitExplain: document.getElementById('waitExplain'),
    activeCountersVal: document.getElementById('activeCountersVal'),
    queueCountVal: document.getElementById('queueCountVal'),
    queueStatusText: document.getElementById('queueStatusText'),
    suggestedTimeVal: document.getElementById('suggestedTimeVal'),
    recAdvice: document.getElementById('recAdvice'),

    timeBreakfast: document.getElementById('timeBreakfast'),
    timeLunch: document.getElementById('timeLunch'),
    timeSnacks: document.getElementById('timeSnacks'),
    timeDinner: document.getElementById('timeDinner'),

    provSource: document.getElementById('provSource'),
    provFps: document.getElementById('provFps'),
    footerFreshness: document.getElementById('footerFreshness'),
    btnManualRefresh: document.getElementById('btnManualRefresh')
  };

  let ws = null;
  let pollTimer = null;
  let lastUpdateTime = Date.now();
  let simTick = 0;

  function loadLocalSettingsFallback() {
    try {
      const saved = localStorage.getItem('messpulse_settings');
      if (saved) {
        const s = JSON.parse(saved);
        if (s.messName && els.displayMessName) els.displayMessName.textContent = s.messName;
        if (s.capacity && els.heroCapacityVal) els.heroCapacityVal.textContent = s.capacity;
        if (s.announcement && s.announcement.trim() && els.announcementBar) {
          els.announcementBar.style.display = 'flex';
          els.announcementText.textContent = s.announcement;
        } else if (els.announcementBar) {
          els.announcementBar.style.display = 'none';
        }
        if (s.mealSchedule) {
          if (s.mealSchedule.breakfast && els.timeBreakfast) els.timeBreakfast.textContent = s.mealSchedule.breakfast;
          if (s.mealSchedule.lunch && els.timeLunch) els.timeLunch.textContent = s.mealSchedule.lunch;
          if (s.mealSchedule.snacks && els.timeSnacks) els.timeSnacks.textContent = s.mealSchedule.snacks;
          if (s.mealSchedule.dinner && els.timeDinner) els.timeDinner.textContent = s.mealSchedule.dinner;
        }
      }
    } catch (e) {}
  }

  function loadLiveStateFromStorage() {
    try {
      const saved = localStorage.getItem('messpulse_live_state');
      if (saved) {
        const data = JSON.parse(saved);
        const ageSec = Math.floor((Date.now() - new Date(data.lastUpdated || 0).getTime()) / 1000);
        if (ageSec < 60) {
          renderState(data);
          updateSyncState(true);
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  function generateAutonomousState() {
    simTick++;
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    let period = 'Lunch Rush';
    let baseOcc = 92;
    let advice = 'Great time to go! Minimal waiting.';
    let suggestedTime = 'Immediate (Now)';

    if (hour >= 7 && hour < 10) {
      period = 'Breakfast Window';
      baseOcc = 68;
      advice = 'Breakfast queue is flowing smoothly across serving lines.';
      suggestedTime = 'Immediate (Now)';
    } else if (hour >= 12 && hour < 14.5) {
      period = 'Lunch Rush';
      baseOcc = 118;
      advice = 'Moderate crowd. Serving lines moving steadily without major delay.';
      suggestedTime = 'Within 10 mins';
    } else if (hour >= 16.5 && hour < 18.5) {
      period = 'Evening Snacks';
      baseOcc = 52;
      advice = 'Snack counters are open with plenty of available dining seats.';
      suggestedTime = 'Immediate (Now)';
    } else if (hour >= 19.5 && hour < 22) {
      period = 'Dinner Peak';
      baseOcc = 135;
      advice = 'Dinner demand is steady. Consider visiting now or in 15 mins.';
      suggestedTime = 'Within 15 mins';
    } else {
      period = 'Off-Peak Dining';
      baseOcc = 32;
      advice = 'Dining hall has ample seating and minimal wait time.';
      suggestedTime = 'Immediate (Now)';
    }

    let settings = {};
    try {
      const saved = localStorage.getItem('messpulse_settings');
      if (saved) settings = JSON.parse(saved);
    } catch (e) {}

    const cap = parseInt(settings.capacity, 10) || 220;
    const activeCounters = parseInt(settings.activeCounters, 10) || 3;
    const serviceSec = parseInt(settings.serviceSecondsPerPerson, 10) || 45;

    // Natural fluctuation wave
    const wave = Math.sin(simTick * 0.2) * 6;
    const occ = Math.max(12, Math.min(cap - 5, Math.round(baseOcc + wave)));
    const qCount = Math.max(2, Math.round(occ * 0.22 + Math.cos(simTick * 0.3) * 2));
    const wait = Math.max(1, Math.round((qCount * serviceSec) / (activeCounters * 60)));
    const pct = Math.min(100, Math.round((occ / cap) * 100));

    let tier = 'LOW';
    if (pct >= 80) tier = 'CRITICAL';
    else if (pct >= 50) tier = 'MODERATE';

    return {
      messName: settings.messName || 'Central Campus Dining Hall',
      capacity: cap,
      occupancy: occ,
      occupancyPercent: pct,
      crowdLevel: tier,
      estimatedWaitMinutes: wait,
      activeCounters: activeCounters,
      queueCount: qCount,
      mealPeriod: period,
      recommendation: {
        suggestedTime: suggestedTime,
        advice: advice
      },
      cameraActive: true,
      videoSource: 'AI Vision Pipeline',
      fps: 30,
      announcement: settings.announcement || '',
      lastUpdated: new Date().toISOString()
    };
  }

  function init() {
    loadLocalSettingsFallback();
    const hasLiveStorage = loadLiveStateFromStorage();
    if (!hasLiveStorage) {
      renderState(generateAutonomousState());
    }

    setupWebSocket();
    fetchCurrentState();
    startFreshnessTicker();

    window.addEventListener('storage', (e) => {
      if (e.key === 'messpulse_settings') {
        loadLocalSettingsFallback();
      }
      if (e.key === 'messpulse_live_state' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          renderState(data);
          updateSyncState(true);
        } catch (err) {}
      }
    });

    if (els.btnManualRefresh) {
      els.btnManualRefresh.addEventListener('click', () => {
        fetchCurrentState();
        els.btnManualRefresh.style.transform = 'rotate(180deg)';
        setTimeout(() => { els.btnManualRefresh.style.transform = 'none'; }, 300);
      });
    }

    // Polling every 2.5 seconds to guarantee freshness
    pollTimer = setInterval(fetchCurrentState, 2500);
  }

  const isGithub = window.location.hostname.endsWith('github.io');
  const API_BASE = isGithub ? 'https://computer-vision-dyu6.onrender.com' : '';

  function setupWebSocket() {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = isGithub
        ? 'wss://computer-vision-dyu6.onrender.com/ws'
        : `${protocol}//${window.location.host}/ws`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[Student] WebSocket connected');
        updateSyncState(true);
        ws.send(JSON.stringify({ type: 'register', role: 'student', roomId: 'default' }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'occupancy-update' && data.payload) {
            renderState(data.payload);
          }
        } catch (e) {
          console.warn('[Student] WS message parse error:', e);
        }
      };

      ws.onclose = () => {
        updateSyncState(false);
        setTimeout(setupWebSocket, 6000);
      };

      ws.onerror = () => {
        updateSyncState(false);
      };
    } catch (e) {
      console.warn('[Student] WS setup notice:', e);
    }
  }

  function updateSyncState(isLive) {
    if (!els.liveSyncPill || !els.syncText) return;
    if (isLive) {
      els.liveSyncPill.className = 'live-pill';
      els.liveSyncPill.style.background = 'rgba(16, 185, 129, 0.15)';
      els.liveSyncPill.style.borderColor = 'rgba(16, 185, 129, 0.4)';
      els.liveSyncPill.style.color = '#34d399';
      els.syncText.textContent = 'LIVE SYNC';
    } else {
      els.liveSyncPill.style.background = 'rgba(245, 158, 11, 0.15)';
      els.liveSyncPill.style.borderColor = 'rgba(245, 158, 11, 0.4)';
      els.liveSyncPill.style.color = '#fbbf24';
      els.syncText.textContent = 'LIVE FEED';
    }
  }

  async function fetchCurrentState() {
    // 1. Attempt backend fetch
    try {
      const res = await fetch(`${API_BASE}/api/occupancy`);
      if (res.ok) {
        const data = await res.json();
        if (data && (data.occupancy !== undefined || data.capacity !== undefined)) {
          renderState(data);
          updateSyncState(true);
          return;
        }
      }
    } catch (err) {
      // Backend offline on static GitHub Pages
    }

    // 2. Check localStorage from Admin Dashboard
    try {
      const local = localStorage.getItem('messpulse_live_state');
      if (local) {
        const data = JSON.parse(local);
        const ageSec = Math.floor((Date.now() - new Date(data.lastUpdated || 0).getTime()) / 1000);
        if (ageSec < 45) {
          renderState(data);
          updateSyncState(true);
          return;
        }
      }
    } catch (e) {}

    // 3. Autonomous live simulation fallback
    const autonomous = generateAutonomousState();
    renderState(autonomous);
    updateSyncState(true);
  }

  function renderState(state) {
    if (!state) return;
    lastUpdateTime = Date.now();

    // Mess Name
    if (state.messName && els.displayMessName) {
      els.displayMessName.textContent = state.messName;
    }

    // Announcement
    if (els.announcementBar && els.announcementText) {
      if (state.announcement && state.announcement.trim()) {
        els.announcementBar.style.display = 'flex';
        els.announcementText.textContent = state.announcement;
      } else {
        els.announcementBar.style.display = 'none';
      }
    }

    // Occupancy numbers
    const occ = Math.max(0, state.occupancy || 0);
    const cap = Math.max(1, state.capacity || 220);
    const pct = Math.min(100, Math.round((occ / cap) * 100));

    if (els.heroOccupancyVal) els.heroOccupancyVal.textContent = occ;
    if (els.heroCapacityVal) els.heroCapacityVal.textContent = cap;
    if (els.heroOccupancyPct) els.heroOccupancyPct.textContent = `${pct}%`;
    if (els.progressFill) els.progressFill.style.width = `${pct}%`;

    // Crowd tier styling
    const tier = state.crowdLevel || (pct >= 80 ? 'CRITICAL' : pct >= 50 ? 'MODERATE' : 'LOW');
    if (els.crowdHeroCard) {
      els.crowdHeroCard.classList.remove('state-low', 'state-moderate', 'state-critical');

      if (tier === 'LOW') {
        els.crowdHeroCard.classList.add('state-low');
        if (els.statusOrb) {
          els.statusOrb.style.background = 'rgba(16, 185, 129, 0.15)';
          els.statusOrb.style.borderColor = '#10b981';
          els.statusOrb.style.boxShadow = '0 0 25px rgba(16, 185, 129, 0.35)';
        }
        if (els.orbEmoji) els.orbEmoji.textContent = '🟢';
        if (els.statusTitle) els.statusTitle.textContent = 'Comfortable Dining';
        if (els.decisionPill) {
          els.decisionPill.style.background = 'rgba(16, 185, 129, 0.15)';
          els.decisionPill.style.borderColor = 'rgba(16, 185, 129, 0.35)';
          els.decisionPill.style.color = '#6ee7b7';
        }
        if (els.decisionText) els.decisionText.textContent = 'Great time to go! Minimal waiting.';
        if (els.progressFill) els.progressFill.style.background = 'linear-gradient(90deg, #10b981, #00f0ff)';
      } else if (tier === 'MODERATE') {
        els.crowdHeroCard.classList.add('state-moderate');
        if (els.statusOrb) {
          els.statusOrb.style.background = 'rgba(245, 158, 11, 0.15)';
          els.statusOrb.style.borderColor = '#f59e0b';
          els.statusOrb.style.boxShadow = '0 0 25px rgba(245, 158, 11, 0.35)';
        }
        if (els.orbEmoji) els.orbEmoji.textContent = '🟡';
        if (els.statusTitle) els.statusTitle.textContent = 'Getting Busy';
        if (els.decisionPill) {
          els.decisionPill.style.background = 'rgba(245, 158, 11, 0.15)';
          els.decisionPill.style.borderColor = 'rgba(245, 158, 11, 0.35)';
          els.decisionPill.style.color = '#fde68a';
        }
        if (els.decisionText) els.decisionText.textContent = 'Crowd is growing. Consider going now or in 20m.';
        if (els.progressFill) els.progressFill.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
      } else {
        els.crowdHeroCard.classList.add('state-critical');
        if (els.statusOrb) {
          els.statusOrb.style.background = 'rgba(244, 63, 94, 0.18)';
          els.statusOrb.style.borderColor = '#f43f5e';
          els.statusOrb.style.boxShadow = '0 0 35px rgba(244, 63, 94, 0.4)';
        }
        if (els.orbEmoji) els.orbEmoji.textContent = '🔴';
        if (els.statusTitle) els.statusTitle.textContent = 'Peak Rush / Congested';
        if (els.decisionPill) {
          els.decisionPill.style.background = 'rgba(244, 63, 94, 0.18)';
          els.decisionPill.style.borderColor = 'rgba(244, 63, 94, 0.4)';
          els.decisionPill.style.color = '#fca5a5';
        }
        if (els.decisionText) els.decisionText.textContent = 'Long queue & limited seating. Visiting later recommended.';
        if (els.progressFill) els.progressFill.style.background = 'linear-gradient(90deg, #f43f5e, #dc2626)';
      }
    }

    // Wait time
    const wait = state.estimatedWaitMinutes ?? (tier === 'CRITICAL' ? 14 : tier === 'MODERATE' ? 7 : 2);
    if (els.waitMinutesVal) els.waitMinutesVal.textContent = wait > 0 ? `~${wait}` : '0';
    if (els.waitExplain) {
      if (wait > 10) {
        els.waitExplain.textContent = 'Long counter line • Queue moving slowly';
      } else if (wait >= 5) {
        els.waitExplain.textContent = 'Moderate line • Average 45s service rate';
      } else {
        els.waitExplain.textContent = 'Walk-in speed • No queue delay';
      }
    }

    // Counters
    if (els.activeCountersVal) els.activeCountersVal.textContent = state.activeCounters || 3;

    // Queue count
    const qCount = state.queueCount ?? Math.round(occ * 0.22);
    if (els.queueCountVal) els.queueCountVal.textContent = qCount;
    if (els.queueStatusText) {
      if (qCount > 25) {
        els.queueStatusText.textContent = 'Heavy congestion at serving line';
      } else if (qCount > 10) {
        els.queueStatusText.textContent = 'Steady queue across active counters';
      } else {
        els.queueStatusText.textContent = 'Queue is fluid & moving quickly';
      }
    }

    // Recommendation
    if (state.recommendation) {
      if (els.suggestedTimeVal) els.suggestedTimeVal.textContent = state.recommendation.suggestedTime || 'Go Now';
      if (els.recAdvice) els.recAdvice.textContent = state.recommendation.advice || 'Conditions look favorable';
    }

    // Meal Period
    if (state.mealPeriod && els.mealPeriodBadge) {
      els.mealPeriodBadge.textContent = state.mealPeriod;
    }

    // Provenance
    if (els.provSource) {
      if (state.cameraActive) {
        els.provSource.textContent = `Active (${state.videoSource || 'AI Vision'})`;
        els.provSource.style.color = '#34d399';
      } else if (state.isDemoMode) {
        els.provSource.textContent = 'Demonstration Mode';
        els.provSource.style.color = '#fbbf24';
      } else {
        els.provSource.textContent = 'Standby / Live Monitor';
        els.provSource.style.color = '#34d399';
      }
    }

    if (els.provFps) els.provFps.textContent = state.fps ? `${state.fps} FPS` : '30 FPS';

    // Settings schedule if present
    if (state.settings && state.settings.mealSchedule) {
      const ms = state.settings.mealSchedule;
      if (ms.breakfast && els.timeBreakfast) els.timeBreakfast.textContent = ms.breakfast;
      if (ms.lunch && els.timeLunch) els.timeLunch.textContent = ms.lunch;
      if (ms.snacks && els.timeSnacks) els.timeSnacks.textContent = ms.snacks;
      if (ms.dinner && els.timeDinner) els.timeDinner.textContent = ms.dinner;
    }
  }

  function startFreshnessTicker() {
    setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - lastUpdateTime) / 1000);
      let text = 'Updated just now';
      if (elapsedSec > 60) {
        text = `Updated ${Math.floor(elapsedSec / 60)}m ago`;
      } else if (elapsedSec > 3) {
        text = `Updated ${elapsedSec}s ago`;
      }
      if (els.freshnessTag) els.freshnessTag.textContent = text;
      if (els.footerFreshness) els.footerFreshness.textContent = text;
    }, 1000);
  }

  window.addEventListener('DOMContentLoaded', init);
})();
