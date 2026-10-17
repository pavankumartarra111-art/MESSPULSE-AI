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
        }
      }
    } catch (e) {}
  }

  function init() {
    loadLocalSettingsFallback();
    setupWebSocket();
    fetchCurrentState();
    startFreshnessTicker();

    window.addEventListener('storage', (e) => {
      if (e.key === 'messpulse_settings') {
        loadLocalSettingsFallback();
      }
    });

    els.btnManualRefresh.addEventListener('click', () => {
      fetchCurrentState();
      els.btnManualRefresh.style.transform = 'rotate(180deg)';
      setTimeout(() => { els.btnManualRefresh.style.transform = 'none'; }, 300);
    });

    // Fallback polling every 3 seconds to guarantee freshness
    pollTimer = setInterval(fetchCurrentState, 3000);
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
        console.log('[Student] WebSocket closed, retrying in 5s');
        updateSyncState(false);
        setTimeout(setupWebSocket, 5000);
      };

      ws.onerror = () => {
        updateSyncState(false);
      };
    } catch (e) {
      console.warn('[Student] WS setup failed, relying on HTTP polling:', e);
    }
  }

  function updateSyncState(isLive) {
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
      els.syncText.textContent = 'POLLING';
    }
  }

  async function fetchCurrentState() {
    try {
      const res = await fetch(`${API_BASE}/api/occupancy`);
      if (res.ok) {
        const data = await res.json();
        renderState(data);
      }
    } catch (err) {
      console.warn('[Student] Failed to fetch state:', err);
    }
  }

  function renderState(state) {
    if (!state) return;
    lastUpdateTime = Date.now();

    // Mess Name
    if (state.messName) {
      els.displayMessName.textContent = state.messName;
    }

    // Announcement
    if (state.announcement && state.announcement.trim()) {
      els.announcementBar.style.display = 'flex';
      els.announcementText.textContent = state.announcement;
    } else {
      els.announcementBar.style.display = 'none';
    }

    // Occupancy numbers
    const occ = Math.max(0, state.occupancy || 0);
    const cap = Math.max(1, state.capacity || 220);
    const pct = Math.min(100, Math.round((occ / cap) * 100));

    els.heroOccupancyVal.textContent = occ;
    els.heroCapacityVal.textContent = cap;
    els.heroOccupancyPct.textContent = `${pct}%`;
    els.progressFill.style.width = `${pct}%`;

    // Crowd tier styling
    const tier = state.crowdLevel || 'LOW';
    els.crowdHeroCard.classList.remove('state-low', 'state-moderate', 'state-critical');

    if (tier === 'LOW') {
      els.crowdHeroCard.classList.add('state-low');
      els.statusOrb.style.background = 'rgba(16, 185, 129, 0.15)';
      els.statusOrb.style.borderColor = '#10b981';
      els.statusOrb.style.boxShadow = '0 0 25px rgba(16, 185, 129, 0.35)';
      els.orbEmoji.textContent = '🟢';
      els.statusTitle.textContent = 'Comfortable Dining';
      els.decisionPill.style.background = 'rgba(16, 185, 129, 0.15)';
      els.decisionPill.style.borderColor = 'rgba(16, 185, 129, 0.35)';
      els.decisionPill.style.color = '#6ee7b7';
      els.decisionText.textContent = 'Great time to go! Minimal waiting.';
      els.progressFill.style.background = 'linear-gradient(90deg, #10b981, #00f0ff)';
    } else if (tier === 'MODERATE') {
      els.crowdHeroCard.classList.add('state-moderate');
      els.statusOrb.style.background = 'rgba(245, 158, 11, 0.15)';
      els.statusOrb.style.borderColor = '#f59e0b';
      els.statusOrb.style.boxShadow = '0 0 25px rgba(245, 158, 11, 0.35)';
      els.orbEmoji.textContent = '🟡';
      els.statusTitle.textContent = 'Getting Busy';
      els.decisionPill.style.background = 'rgba(245, 158, 11, 0.15)';
      els.decisionPill.style.borderColor = 'rgba(245, 158, 11, 0.35)';
      els.decisionPill.style.color = '#fde68a';
      els.decisionText.textContent = 'Crowd is growing. Consider going now or in 20m.';
      els.progressFill.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
    } else {
      els.crowdHeroCard.classList.add('state-critical');
      els.statusOrb.style.background = 'rgba(244, 63, 94, 0.18)';
      els.statusOrb.style.borderColor = '#f43f5e';
      els.statusOrb.style.boxShadow = '0 0 35px rgba(244, 63, 94, 0.4)';
      els.orbEmoji.textContent = '🔴';
      els.statusTitle.textContent = 'Peak Rush / Congested';
      els.decisionPill.style.background = 'rgba(244, 63, 94, 0.18)';
      els.decisionPill.style.borderColor = 'rgba(244, 63, 94, 0.4)';
      els.decisionPill.style.color = '#fca5a5';
      els.decisionText.textContent = 'Long queue & limited seating. Visiting later recommended.';
      els.progressFill.style.background = 'linear-gradient(90deg, #f43f5e, #dc2626)';
    }

    // Wait time
    const wait = state.estimatedWaitMinutes ?? (tier === 'CRITICAL' ? 14 : tier === 'MODERATE' ? 7 : 2);
    els.waitMinutesVal.textContent = wait > 0 ? `~${wait}` : '0';
    if (wait > 10) {
      els.waitExplain.textContent = 'Long counter line • Queue moving slowly';
    } else if (wait >= 5) {
      els.waitExplain.textContent = 'Moderate line • Average 45s service rate';
    } else {
      els.waitExplain.textContent = 'Walk-in speed • No queue delay';
    }

    // Counters
    els.activeCountersVal.textContent = state.activeCounters || 3;

    // Queue count
    const qCount = state.queueCount ?? Math.round(occ * 0.25);
    els.queueCountVal.textContent = qCount;
    if (qCount > 25) {
      els.queueStatusText.textContent = 'Heavy congestion at serving line';
    } else if (qCount > 10) {
      els.queueStatusText.textContent = 'Steady queue across active counters';
    } else {
      els.queueStatusText.textContent = 'Queue is fluid & moving quickly';
    }

    // Recommendation
    if (state.recommendation) {
      els.suggestedTimeVal.textContent = state.recommendation.suggestedTime || 'Go Now';
      els.recAdvice.textContent = state.recommendation.advice || 'Conditions look favorable';
    }

    // Meal Period
    if (state.mealPeriod) {
      els.mealPeriodBadge.textContent = state.mealPeriod;
    }

    // Provenance
    if (state.cameraActive) {
      els.provSource.textContent = `Active (${state.videoSource || 'Camera'})`;
      els.provSource.style.color = '#34d399';
    } else if (state.isDemoMode) {
      els.provSource.textContent = 'Demonstration Mode';
      els.provSource.style.color = '#fbbf24';
    } else {
      els.provSource.textContent = 'Standby / Last Observed';
      els.provSource.style.color = '#94a3b8';
    }

    els.provFps.textContent = state.fps ? `${state.fps} FPS` : '--';

    // Settings schedule if present
    if (state.settings && state.settings.mealSchedule) {
      const ms = state.settings.mealSchedule;
      if (ms.breakfast) els.timeBreakfast.textContent = ms.breakfast;
      if (ms.lunch) els.timeLunch.textContent = ms.lunch;
      if (ms.snacks) els.timeSnacks.textContent = ms.snacks;
      if (ms.dinner) els.timeDinner.textContent = ms.dinner;
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
      els.freshnessTag.textContent = text;
      els.footerFreshness.textContent = text;
    }, 1000);
  }

  window.addEventListener('DOMContentLoaded', init);
})();
