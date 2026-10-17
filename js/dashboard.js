/**
 * MESSPULSE AI - Real-Time Campus Dining Intelligence Operations Station
 * Complete computer-vision detection loop, multi-zone classification, queue analytics,
 * WebRTC mobile camera streaming, and shared student synchronizer.
 */

(function () {
  'use strict';

  // ========================================================
  // APPLICATION STATE & ENVIRONMENT
  // ========================================================
  const IS_GITHUB_PAGES = window.location.hostname.endsWith('github.io');
  const API_BASE = IS_GITHUB_PAGES ? 'https://computer-vision-dyu6.onrender.com' : '';

  const state = {
    // Vision & Model
    model: null,
    isModelLoading: true,
    isMonitoring: true,
    peerConnection: null,
    signaling: null,
    videoSource: 'none', // 'mobile' | 'webcam' | 'cctv' | 'sample' | 'demo' | 'none'
    activeSourceTab: 'mobile',
    localWebcamStream: null,
    sampleFile: null,
    sampleVideoUrl: null,
    isSamplePlaying: false,
    cctvUrl: '',
    cctvStreamType: 'http',
    cctvConnected: false,
    
    // Detection Parameters
    confidenceThreshold: 0.5,
    smoothingWindowSize: 7,
    recentCounts: [],
    currentHumanCount: 0,
    currentQueueCount: 0,
    currentDiningCount: 0,
    currentRawCount: 0,

    // Mess Configuration & Thresholds
    capacity: 220,
    messName: 'Central Campus Dining Hall',
    activeCounters: 3,
    serviceSecondsPerPerson: 45,
    thresholds: {
      lowMax: 65,
      moderateMax: 135,
      highMax: 185,
      criticalMax: 220
    },

    // Session Metrics & History
    sessionCounts: [],
    sessionPeak: 0,
    totalDetectionsCount: 0,
    confidenceSum: 0,
    lastFrameTime: performance.now(),
    fps: 0,
    fpsHistory: [],
    inferenceLatency: 0,
    
    // Trend History Buffer (30 points for sparkline/chart)
    chartRange: '30s', // '30s' | '5m' | '30m'
    trendHistory30s: Array(30).fill().map((_, i) => ({ time: Date.now() - (29 - i) * 1000, occ: 0, queue: 0 })),
    trendHistory5m: Array(30).fill().map((_, i) => ({ time: Date.now() - (29 - i) * 10000, occ: 0, queue: 0 })),
    trendHistory30m: Array(30).fill().map((_, i) => ({ time: Date.now() - (29 - i) * 60000, occ: 0, queue: 0 })),

    // Visual Flags
    showBoxes: true,
    showLabels: true,
    showZonesOverlay: true,
    audioAlerts: false,

    // Demo Mode Simulation
    isDemoMode: false,
    demoScenario: 'lunch_rush',
    demoTick: 0,
    demoTimer: null,
    simulatedBoxes: [],

    // Event Center
    events: [],
    unreadAlerts: 0,
    alertFilter: 'ALL',

    // Last Server Push
    lastServerPush: 0,
    lastSyncTime: Date.now()
  };

  // ========================================================
  // DOM ELEMENT SELECTORS
  // ========================================================
  const els = {
    // Navigation
    navButtons: document.querySelectorAll('.nav-item'),
    viewPanels: document.querySelectorAll('.view-panel'),

    // Command Bar
    locationSelect: document.getElementById('locationSelect'),
    monitorStatusPill: document.getElementById('monitorStatusPill'),
    monitorDot: document.getElementById('monitorDot'),
    monitorStatusText: document.getElementById('monitorStatusText'),
    cameraFeedPill: document.getElementById('cameraFeedPill'),
    cameraDot: document.getElementById('cameraDot'),
    cameraFeedText: document.getElementById('cameraFeedText'),
    freshnessDisplay: document.getElementById('freshnessDisplay'),
    demoModeToggle: document.getElementById('demoModeToggle'),
    demoModeBanner: document.getElementById('demoModeBanner'),
    btnExitDemo: document.getElementById('btnExitDemo'),
    btnQuickSound: document.getElementById('btnQuickSound'),
    soundIcon: document.getElementById('soundIcon'),
    cameraStreamBadge: document.getElementById('cameraStreamBadge'),
    unreadAlertCount: document.getElementById('unreadAlertCount'),

    // Health Sidebar
    healthTag: document.getElementById('healthTag'),
    modelHealthVal: document.getElementById('modelHealthVal'),
    wsHealthVal: document.getElementById('wsHealthVal'),
    latencyHealthVal: document.getElementById('latencyHealthVal'),

    // Overview Hero
    gaugeFillCircle: document.getElementById('gaugeFillCircle'),
    heroPct: document.getElementById('heroPct'),
    heroOccupancyNum: document.getElementById('heroOccupancyNum'),
    heroCapacityNum: document.getElementById('heroCapacityNum'),
    heroSeatsLeft: document.getElementById('heroSeatsLeft'),
    heroTierPill: document.getElementById('heroTierPill'),
    heroSmoothingNote: document.getElementById('heroSmoothingNote'),
    heroFreshness: document.getElementById('heroFreshness'),
    heroSourceDisplay: document.getElementById('heroSourceDisplay'),

    // Wait Time & Recommendation
    waitLargeNum: document.getElementById('waitLargeNum'),
    waitStatusPill: document.getElementById('waitStatusPill'),
    waitQueueCount: document.getElementById('waitQueueCount'),
    waitActiveCounters: document.getElementById('waitActiveCounters'),
    waitServiceRate: document.getElementById('waitServiceRate'),
    waitCalcExplain: document.getElementById('waitCalcExplain'),
    heroRecCard: document.getElementById('heroRecCard'),
    recHeadline: document.getElementById('recHeadline'),
    recBody: document.getElementById('recBody'),
    recSuggestedTime: document.getElementById('recSuggestedTime'),
    recExpectedSurge: document.getElementById('recExpectedSurge'),

    // AI Insights & Forecasts
    velocityTitle: document.getElementById('velocityTitle'),
    velocityText: document.getElementById('velocityText'),
    queueClearanceTitle: document.getElementById('queueClearanceTitle'),
    queueClearanceText: document.getElementById('queueClearanceText'),
    peakForecastTitle: document.getElementById('peakForecastTitle'),
    peakForecastText: document.getElementById('peakForecastText'),

    // KPIs
    kpiOccupancy: document.getElementById('kpiOccupancy'),
    kpiOccupancyPct: document.getElementById('kpiOccupancyPct'),
    kpiQueue: document.getElementById('kpiQueue'),
    kpiPeak: document.getElementById('kpiPeak'),
    kpiAverage: document.getElementById('kpiAverage'),
    kpiFps: document.getElementById('kpiFps'),
    kpiConfidence: document.getElementById('kpiConfidence'),

    // Trend Chart
    mainTrendCanvas: document.getElementById('mainTrendCanvas'),
    chartTooltip: document.getElementById('chartTooltip'),
    chartRangeBtns: document.querySelectorAll('.chart-range-btn'),
    chartPointsCount: document.getElementById('chartPointsCount'),

    // Live AI Studio - Source Selector Bar
    currentSourceBadge: document.getElementById('currentSourceBadge'),
    btnSrcWebcam: document.getElementById('btnSrcWebcam'),
    btnSrcMobile: document.getElementById('btnSrcMobile'),
    btnSrcCctv: document.getElementById('btnSrcCctv'),
    btnSrcSample: document.getElementById('btnSrcSample'),
    btnSrcDemo: document.getElementById('btnSrcDemo'),
    dotSrcWebcam: document.getElementById('dotSrcWebcam'),
    dotSrcMobile: document.getElementById('dotSrcMobile'),
    dotSrcCctv: document.getElementById('dotSrcCctv'),
    dotSrcSample: document.getElementById('dotSrcSample'),
    dotSrcDemo: document.getElementById('dotSrcDemo'),

    // Viewfinder
    viewfinderWrapper: document.getElementById('viewfinderWrapper'),
    remoteVideo: document.getElementById('remoteVideo'),
    detectionCanvas: document.getElementById('detectionCanvas'),
    emptyState: document.getElementById('emptyState'),
    emptyStateDesc: document.getElementById('emptyStateDesc'),
    btnTestWebcam: document.getElementById('btnTestWebcam'),
    btnQuickSampleUpload: document.getElementById('btnQuickSampleUpload'),
    btnTriggerDemoFromStudio: document.getElementById('btnTriggerDemoFromStudio'),
    hudSource: document.getElementById('hudSource'),
    hudStreamDot: document.getElementById('hudStreamDot'),
    hudResolution: document.getElementById('hudResolution'),
    hudFps: document.getElementById('hudFps'),
    hudDetectedCount: document.getElementById('hudDetectedCount'),
    toggleBoxes: document.getElementById('toggleBoxes'),
    toggleLabels: document.getElementById('toggleLabels'),
    toggleZonesOverlay: document.getElementById('toggleZonesOverlay'),
    btnSnapshot: document.getElementById('btnSnapshot'),
    btnStartStop: document.getElementById('btnStartStop'),
    btnFullscreen: document.getElementById('btnFullscreen'),
    diagProtocol: document.getElementById('diagProtocol'),
    diagIceState: document.getElementById('diagIceState'),
    diagLatency: document.getElementById('diagLatency'),
    diagDropRate: document.getElementById('diagDropRate'),

    // Source Panels
    panelSourceWebcam: document.getElementById('panelSourceWebcam'),
    panelSourceMobile: document.getElementById('panelSourceMobile'),
    panelSourceCctv: document.getElementById('panelSourceCctv'),
    panelSourceSample: document.getElementById('panelSourceSample'),
    panelSourceDemo: document.getElementById('panelSourceDemo'),

    // Source Panel 1: Webcam
    webcamDeviceSelect: document.getElementById('webcamDeviceSelect'),
    webcamResolutionSelect: document.getElementById('webcamResolutionSelect'),
    btnStartWebcamSource: document.getElementById('btnStartWebcamSource'),
    btnStopWebcamSource: document.getElementById('btnStopWebcamSource'),
    webcamStatusPill: document.getElementById('webcamStatusPill'),
    webcamStatusText: document.getElementById('webcamStatusText'),

    // Source Panel 2: Mobile (Preserved)
    qrImage: document.getElementById('qrImage'),
    mobileUrlDisplay: document.getElementById('mobileUrlDisplay'),
    btnCopyUrl: document.getElementById('btnCopyUrl'),
    mobileStatusPill: document.getElementById('mobileStatusPill'),
    mobileStatusText: document.getElementById('mobileStatusText'),
    ipSelect: document.getElementById('ipSelect'),
    btnReconnect: document.getElementById('btnReconnect'),

    // Source Panel 3: CCTV / IP Camera (NEW)
    cctvCameraName: document.getElementById('cctvCameraName'),
    cctvStreamType: document.getElementById('cctvStreamType'),
    cctvStreamUrl: document.getElementById('cctvStreamUrl'),
    cctvUsername: document.getElementById('cctvUsername'),
    cctvPassword: document.getElementById('cctvPassword'),
    btnCctvTest: document.getElementById('btnCctvTest'),
    btnCctvConnect: document.getElementById('btnCctvConnect'),
    btnCctvDisconnect: document.getElementById('btnCctvDisconnect'),
    btnCctvReconnect: document.getElementById('btnCctvReconnect'),
    cctvStatusBanner: document.getElementById('cctvStatusBanner'),
    cctvStatusDot: document.getElementById('cctvStatusDot'),
    cctvStatusState: document.getElementById('cctvStatusState'),
    cctvLastFrameTime: document.getElementById('cctvLastFrameTime'),
    cctvLatencyTag: document.getElementById('cctvLatencyTag'),
    cctvFeedbackMsg: document.getElementById('cctvFeedbackMsg'),

    // Source Panel 4: Sample Video Upload (NEW)
    sampleDropzone: document.getElementById('sampleDropzone'),
    sampleVideoFile: document.getElementById('sampleVideoFile'),
    sampleFileInfoBox: document.getElementById('sampleFileInfoBox'),
    sampleFileName: document.getElementById('sampleFileName'),
    sampleFileSize: document.getElementById('sampleFileSize'),
    sampleValidationBadge: document.getElementById('sampleValidationBadge'),
    btnSamplePlayPause: document.getElementById('btnSamplePlayPause'),
    btnSampleRestart: document.getElementById('btnSampleRestart'),
    btnSampleStop: document.getElementById('btnSampleStop'),
    sampleCurrentTime: document.getElementById('sampleCurrentTime'),
    sampleDuration: document.getElementById('sampleDuration'),
    sampleSeekSlider: document.getElementById('sampleSeekSlider'),

    // Source Panel 5: Demo Scenario (Preserved)
    demoPresetSelect: document.getElementById('demoPresetSelect'),
    btnToggleDemoSource: document.getElementById('btnToggleDemoSource'),

    // Vision Controls
    confidenceSlider: document.getElementById('confidenceSlider'),
    confidenceValDisplay: document.getElementById('confidenceValDisplay'),
    smoothingSelect: document.getElementById('smoothingSelect'),
    soundAlertToggle: document.getElementById('soundAlertToggle'),
    btnTestSound: document.getElementById('btnTestSound'),

    // Student Preview
    studentQrImage: document.getElementById('studentQrImage'),
    studentDirectUrlDisplay: document.getElementById('studentDirectUrlDisplay'),
    btnCopyStudentUrl: document.getElementById('btnCopyStudentUrl'),

    // Queue Intel
    qIntelQueueLength: document.getElementById('qIntelQueueLength'),
    qIntelWaitMins: document.getElementById('qIntelWaitMins'),
    qIntelThroughput: document.getElementById('qIntelThroughput'),
    qIntelGrowthRate: document.getElementById('qIntelGrowthRate'),
    queueSeverityTag: document.getElementById('queueSeverityTag'),
    simCountersSlider: document.getElementById('simCountersSlider'),
    simCountersVal: document.getElementById('simCountersVal'),
    simServiceTimeSlider: document.getElementById('simServiceTimeSlider'),
    simServiceTimeVal: document.getElementById('simServiceTimeVal'),
    simThroughputRes: document.getElementById('simThroughputRes'),
    simClearTimeRes: document.getElementById('simClearTimeRes'),

    // Zone Monitoring
    zoneCounterCount: document.getElementById('zoneCounterCount'),
    zoneCounterBar: document.getElementById('zoneCounterBar'),
    zoneCounterCongestion: document.getElementById('zoneCounterCongestion'),
    zoneDiningCount: document.getElementById('zoneDiningCount'),
    zoneDiningBar: document.getElementById('zoneDiningBar'),
    zoneDiningCongestion: document.getElementById('zoneDiningCongestion'),
    zoneExpressCount: document.getElementById('zoneExpressCount'),
    zoneExpressBar: document.getElementById('zoneExpressBar'),
    zoneEntryCount: document.getElementById('zoneEntryCount'),
    zoneEntryBar: document.getElementById('zoneEntryBar'),
    zoneExpressCongestion: document.getElementById('zoneExpressCongestion'),
    zoneEntryCongestion: document.getElementById('zoneEntryCongestion'),
    fpZoneCounter: document.getElementById('fpZoneCounter'),
    fpZoneDining: document.getElementById('fpZoneDining'),
    fpZoneExpress: document.getElementById('fpZoneExpress'),
    fpZoneEntry: document.getElementById('fpZoneEntry'),
    countersList: document.getElementById('countersList'),
    studentIframe: document.getElementById('studentIframe'),

    // Analytics
    heatmapGrid: document.getElementById('heatmapGrid'),
    btnExportData: document.getElementById('btnExportData'),

    // Alerts
    eventsListContainer: document.getElementById('eventsListContainer'),
    alertFilterBtns: document.querySelectorAll('.filter-btn'),

    // Settings
    settingsForm: document.getElementById('settingsForm'),
    cfgMessName: document.getElementById('cfgMessName'),
    cfgCapacity: document.getElementById('cfgCapacity'),
    cfgLowMax: document.getElementById('cfgLowMax'),
    cfgModerateMax: document.getElementById('cfgModerateMax'),
    cfgHighMax: document.getElementById('cfgHighMax'),
    cfgActiveCounters: document.getElementById('cfgActiveCounters'),
    cfgServiceSec: document.getElementById('cfgServiceSec'),
    cfgAnnouncement: document.getElementById('cfgAnnouncement'),
    saveStatusMsg: document.getElementById('saveStatusMsg')
  };

  const canvasCtx = els.detectionCanvas.getContext('2d');
  const trendCtx = els.mainTrendCanvas.getContext('2d');

  // ========================================================
  // INITIALIZATION
  // ========================================================
  async function init() {
    setupNavigation();
    setupVideoSourceControls();
    populateWebcamDevices();
    setupEventListeners();
    setupSimulatorControls();
    startFreshnessTicker();
    startTrendHistoryRecorder();

    // Fetch network config & QR codes
    await loadNetworkConfig();

    // Fetch initial settings & events from server
    await fetchInitialSettings();
    await fetchEvents();
    await loadAnalyticsHeatmap();

    // Initialize WebRTC signaling
    initSignaling();

    // Load TensorFlow.js COCO-SSD Model
    await loadDetectionModel();

    // Start continuous inference and render loop
    requestAnimationFrame(detectionLoop);
  }

  // ========================================================
  // NAVIGATION ROUTER
  // ========================================================
  function setupNavigation() {
    els.navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetView = btn.dataset.view;
        switchView(targetView);
      });
    });
  }

  function switchView(viewName) {
    els.navButtons.forEach(b => {
      if (b.dataset.view === viewName) b.classList.add('active');
      else b.classList.remove('active');
    });

    els.viewPanels.forEach(panel => {
      if (panel.id === `view${viewName.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')}`) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
    });

    // Special trigger: render chart when opening overview
    if (viewName === 'overview') {
      setTimeout(renderMainTrendChart, 50);
    }
  }

  // ========================================================
  // NETWORK CONFIGURATION & QR CODES
  // ========================================================
  async function loadNetworkConfig(selectedIp = null) {
    if (IS_GITHUB_PAGES) {
      const studentDirectUrl = `${window.location.origin}${window.location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '')}/student.html`;
      if (els.studentDirectUrlDisplay) {
        els.studentDirectUrlDisplay.textContent = studentDirectUrl;
      }
      if (els.studentQrImage) {
        els.studentQrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(studentDirectUrl)}`;
      }
      if (els.mobileUrlDisplay) {
        els.mobileUrlDisplay.value = 'https://computer-vision-dyu6.onrender.com/mobile';
      }
    }

    try {
      const url = selectedIp ? `${API_BASE}/api/config?ip=${encodeURIComponent(selectedIp)}` : `${API_BASE}/api/config`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.qrCode && !IS_GITHUB_PAGES) {
        els.qrImage.src = data.qrCode;
      }
      if (data.studentQrCode && !IS_GITHUB_PAGES) {
        els.studentQrImage.src = data.studentQrCode;
      }

      if (!IS_GITHUB_PAGES) {
        els.mobileUrlDisplay.value = data.mobileUrl;
        els.studentDirectUrlDisplay.textContent = data.studentUrl;
      }

      // Populate IP select dropdown if empty
      if (els.ipSelect && els.ipSelect.children.length === 0 && data.allIps) {
        data.allIps.forEach(item => {
          const opt = document.createElement('option');
          opt.value = item.address;
          opt.textContent = `${item.name} (${item.address})`;
          if (item.address === (data.selectedIp || data.lanIp)) {
            opt.selected = true;
          }
          els.ipSelect.appendChild(opt);
        });
      }
    } catch (err) {
      console.warn('Network config notice (using client defaults):', err.message);
    }
  }

  // ========================================================
  // WEBRTC SIGNALING
  // ========================================================
  function initSignaling() {
    state.signaling = new SignalingClient('desktop', 'default');

    state.signaling.on('connection-change', ({ status }) => {
      console.log('[Dashboard] Signaling:', status);
      if (status === 'connected') {
        els.wsHealthVal.textContent = 'Connected (Active)';
        els.wsHealthVal.style.color = '#34d399';
      } else {
        els.wsHealthVal.textContent = 'Disconnected';
        els.wsHealthVal.style.color = '#f87171';
      }
    });

    state.signaling.on('peer-status', ({ peer, connected }) => {
      if (peer === 'mobile') {
        if (connected) {
          updateMobileConnectionStatus('connected', 'Mobile Camera: Connected');
          els.cameraStreamBadge.textContent = 'CONNECTED';
          els.cameraStreamBadge.className = 'nav-badge text-emerald';
        } else {
          updateMobileConnectionStatus('waiting', 'Waiting for mobile camera');
          els.cameraStreamBadge.textContent = 'STANDBY';
          els.cameraStreamBadge.className = 'nav-badge';
          if (state.videoSource === 'mobile') {
            stopVideoFeed();
          }
        }
      }
    });

    state.signaling.on('signal', async ({ sender, payload }) => {
      if (sender === 'mobile') {
        await handleMobileSignal(payload);
      }
    });

    state.signaling.on('camera-status', (payload) => {
      console.log('[Dashboard] Camera status:', payload);
      if (payload.status === 'stopped' && state.videoSource === 'mobile') {
        stopVideoFeed();
      }
    });

    state.signaling.connect();
  }

  async function setupPeerConnection() {
    if (state.peerConnection) {
      state.peerConnection.close();
      state.peerConnection = null;
    }

    const pc = new RTCPeerConnection(window.RTC_CONFIG);
    state.peerConnection = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        state.signaling.sendSignal('mobile', {
          type: 'candidate',
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('[WebRTC] Track received:', event.track.kind);
      if (event.streams && event.streams[0]) {
        els.remoteVideo.srcObject = event.streams[0];
        state.videoSource = 'mobile';
        updateVideoSourceHUD('Mobile Camera (WebRTC)');
        hideEmptyState();
        els.remoteVideo.play().catch(e => console.warn('Autoplay error:', e));
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', pc.connectionState);
      els.diagIceState.textContent = pc.connectionState;
      if (pc.connectionState === 'connected') {
        updateMobileConnectionStatus('connected', 'Streaming Live');
        els.cameraDot.className = 'pulse-dot live';
        els.cameraFeedText.textContent = 'CAMERA: MOBILE STREAM';
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        updateMobileConnectionStatus('waiting', 'Stream Lost');
        els.cameraDot.className = 'pulse-dot waiting';
        els.cameraFeedText.textContent = 'CAMERA: STANDBY';
        if (state.videoSource === 'mobile') stopVideoFeed();
      }
    };

    return pc;
  }

  async function handleMobileSignal(data) {
    try {
      if (data.type === 'offer') {
        const pc = await setupPeerConnection();
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        state.signaling.sendSignal('mobile', answer);
      } else if (data.type === 'candidate' && state.peerConnection) {
        try {
          await state.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.warn('[WebRTC] ICE candidate error:', e);
        }
      }
    } catch (err) {
      console.error('[WebRTC] Signal handling error:', err);
    }
  }

  // ========================================================
  // 5-WAY VIDEO SOURCE SELECTOR & CONFIGURATION
  // ========================================================

  function setupVideoSourceControls() {
    const sourceBtns = [
      { key: 'webcam', btn: els.btnSrcWebcam },
      { key: 'mobile', btn: els.btnSrcMobile },
      { key: 'cctv', btn: els.btnSrcCctv },
      { key: 'sample', btn: els.btnSrcSample },
      { key: 'demo', btn: els.btnSrcDemo }
    ];

    sourceBtns.forEach(({ key, btn }) => {
      if (!btn) return;
      btn.addEventListener('click', () => {
        switchSourceTab(key);
      });
    });

    // Empty state quick buttons
    if (els.btnQuickSampleUpload) {
      els.btnQuickSampleUpload.addEventListener('click', () => {
        switchSourceTab('sample');
        if (els.sampleVideoFile) els.sampleVideoFile.click();
      });
    }

    // Webcam source panel buttons
    if (els.btnStartWebcamSource) {
      els.btnStartWebcamSource.addEventListener('click', startLaptopWebcam);
    }
    if (els.btnStopWebcamSource) {
      els.btnStopWebcamSource.addEventListener('click', stopLaptopWebcam);
    }

    // Demo source panel button & preset
    if (els.btnToggleDemoSource) {
      els.btnToggleDemoSource.addEventListener('click', () => {
        if (state.isDemoMode) {
          stopDemoMode();
        } else {
          startDemoMode();
        }
      });
    }
    if (els.demoPresetSelect) {
      els.demoPresetSelect.addEventListener('change', (e) => {
        state.demoScenario = e.target.value;
      });
    }

    setupCctvControls();
    setupSampleVideoControls();
  }

  function switchSourceTab(sourceKey) {
    state.activeSourceTab = sourceKey;
    const items = [
      { key: 'webcam', btn: els.btnSrcWebcam, panel: els.panelSourceWebcam },
      { key: 'mobile', btn: els.btnSrcMobile, panel: els.panelSourceMobile },
      { key: 'cctv', btn: els.btnSrcCctv, panel: els.panelSourceCctv },
      { key: 'sample', btn: els.btnSrcSample, panel: els.panelSourceSample },
      { key: 'demo', btn: els.btnSrcDemo, panel: els.panelSourceDemo }
    ];

    items.forEach(item => {
      if (item.key === sourceKey) {
        if (item.btn) item.btn.classList.add('active');
        if (item.panel) item.panel.style.display = 'block';
      } else {
        if (item.btn) item.btn.classList.remove('active');
        if (item.panel) item.panel.style.display = 'none';
      }
    });

    const badgeLabels = {
      webcam: 'LAPTOP WEBCAM SELECTED',
      mobile: 'MOBILE CAMERA SELECTED',
      cctv: 'CCTV / IP CAMERA SELECTED',
      sample: 'SAMPLE VIDEO SELECTED',
      demo: 'DEMO SCENARIO SELECTED'
    };
    if (els.currentSourceBadge) {
      els.currentSourceBadge.textContent = badgeLabels[sourceKey] || `${sourceKey.toUpperCase()} SELECTED`;
    }
  }

  function releaseCurrentSource() {
    // Stop local webcam
    if (state.localWebcamStream) {
      state.localWebcamStream.getTracks().forEach(t => t.stop());
      state.localWebcamStream = null;
    }
    if (els.btnStartWebcamSource) els.btnStartWebcamSource.style.display = 'block';
    if (els.btnStopWebcamSource) els.btnStopWebcamSource.style.display = 'none';
    if (els.btnTestWebcam) {
      els.btnTestWebcam.textContent = '💻 Test Laptop Webcam';
      els.btnTestWebcam.classList.remove('btn-secondary');
      els.btnTestWebcam.classList.add('btn-primary');
    }

    // Stop sample video
    if (state.videoSource === 'sample') {
      els.remoteVideo.pause();
      if (els.btnSamplePlayPause) els.btnSamplePlayPause.textContent = '▶ Start Processing';
    }

    // Stop CCTV
    if (state.videoSource === 'cctv') {
      els.remoteVideo.pause();
      els.remoteVideo.removeAttribute('src');
    }

    // Stop Demo mode
    if (state.isDemoMode) {
      stopDemoMode();
    }

    // Clear video element
    els.remoteVideo.srcObject = null;
    els.remoteVideo.removeAttribute('src');
    canvasCtx.clearRect(0, 0, els.detectionCanvas.width, els.detectionCanvas.height);
    stopVideoFeed();
    resetSourceStatusDots();
  }

  function resetSourceStatusDots() {
    if (els.dotSrcWebcam) els.dotSrcWebcam.className = state.videoSource === 'webcam' ? 'src-status-dot live' : 'src-status-dot';
    if (els.dotSrcMobile) els.dotSrcMobile.className = state.videoSource === 'mobile' ? 'src-status-dot live' : 'src-status-dot';
    if (els.dotSrcCctv) els.dotSrcCctv.className = state.videoSource === 'cctv' ? 'src-status-dot live' : 'src-status-dot';
    if (els.dotSrcSample) els.dotSrcSample.className = state.videoSource === 'sample' && !els.remoteVideo.paused ? 'src-status-dot live' : 'src-status-dot';
    if (els.dotSrcDemo) els.dotSrcDemo.className = state.isDemoMode ? 'src-status-dot live' : 'src-status-dot';
  }

  // ========================================================
  // SOURCE 1: LAPTOP WEBCAM
  // ========================================================
  async function populateWebcamDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      // Only include devices with a non-empty deviceId (empty before permission grant)
      const videoDevices = devices.filter(d => d.kind === 'videoinput' && d.deviceId);
      if (els.webcamDeviceSelect) {
        // Always preserve a default option
        els.webcamDeviceSelect.innerHTML = '<option value="default">Default System Webcam</option>';
        videoDevices.forEach((dev, idx) => {
          const opt = document.createElement('option');
          opt.value = dev.deviceId;
          opt.textContent = dev.label || `Camera ${idx + 1}`;
          els.webcamDeviceSelect.appendChild(opt);
        });
      }
    } catch (e) {
      console.warn('Device enumeration notice:', e);
    }
  }

  async function startLaptopWebcam() {
    // Secure context guard
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Camera access requires HTTPS or localhost. Your browser does not support getUserMedia on this origin.');
      if (els.webcamStatusPill) {
        els.webcamStatusPill.className = 'conn-status-pill status-waiting';
        els.webcamStatusText.textContent = 'Insecure Context — HTTPS Required';
      }
      return;
    }

    // Release previous source safely
    try { releaseCurrentSource(); } catch (e) { console.warn('[Webcam] Release error (non-fatal):', e); }

    try {
      const deviceId = els.webcamDeviceSelect ? els.webcamDeviceSelect.value : null;
      const resVal = els.webcamResolutionSelect ? els.webcamResolutionSelect.value : '720p';
      let width = 1280, height = 720;
      if (resVal === '1080p') { width = 1920; height = 1080; }
      else if (resVal === '480p') { width = 640; height = 480; }

      const constraints = {
        video: {
          width: { ideal: width },
          height: { ideal: height },
          ...(deviceId && deviceId !== 'default' ? { deviceId: { ideal: deviceId } } : {})
        },
        audio: false
      };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (constraintErr) {
        // Fallback: try basic video if ideal constraints fail
        console.warn('[Webcam] Ideal constraints failed, falling back to basic video:', constraintErr);
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      state.localWebcamStream = stream;
      els.remoteVideo.srcObject = stream;
      state.videoSource = 'webcam';
      updateVideoSourceHUD('Laptop Webcam (Direct Ingestion)');
      hideEmptyState();
      await els.remoteVideo.play().catch(e => console.warn('[Webcam] Autoplay blocked:', e));

      // Re-populate device list now that permission is granted
      populateWebcamDevices();

      if (els.btnStartWebcamSource) els.btnStartWebcamSource.style.display = 'none';
      if (els.btnStopWebcamSource) els.btnStopWebcamSource.style.display = 'block';
      if (els.webcamStatusPill) {
        els.webcamStatusPill.className = 'conn-status-pill status-connected';
        els.webcamStatusText.textContent = `Webcam Active (${width}x${height})`;
      }
      if (els.dotSrcWebcam) els.dotSrcWebcam.className = 'src-status-dot live';
      els.cameraDot.className = 'pulse-dot live';
      els.cameraFeedText.textContent = 'CAMERA: LAPTOP WEBCAM';
      els.cameraStreamBadge.textContent = 'WEBCAM ACTIVE';
      els.btnTestWebcam.textContent = '⏹ Stop Laptop Webcam';
      els.btnTestWebcam.classList.remove('btn-primary');
      els.btnTestWebcam.classList.add('btn-secondary');
    } catch (err) {
      console.error('[Webcam] Fatal error:', err);
      alert('Could not access laptop webcam: ' + err.message);
      if (els.webcamStatusPill) {
        els.webcamStatusPill.className = 'conn-status-pill status-waiting';
        els.webcamStatusText.textContent = 'Permission Denied / Camera Unavailable';
      }
    }
  }

  function stopLaptopWebcam() {
    if (state.localWebcamStream) {
      state.localWebcamStream.getTracks().forEach(t => t.stop());
      state.localWebcamStream = null;
    }
    stopVideoFeed();
    if (els.btnStartWebcamSource) els.btnStartWebcamSource.style.display = 'block';
    if (els.btnStopWebcamSource) els.btnStopWebcamSource.style.display = 'none';
    if (els.webcamStatusPill) {
      els.webcamStatusPill.className = 'conn-status-pill status-waiting';
      els.webcamStatusText.textContent = 'Webcam on Standby';
    }
    if (els.dotSrcWebcam) els.dotSrcWebcam.className = 'src-status-dot';
    els.btnTestWebcam.textContent = '💻 Test Laptop Webcam';
    els.btnTestWebcam.classList.remove('btn-secondary');
    els.btnTestWebcam.classList.add('btn-primary');
  }

  async function toggleLaptopWebcam() {
    if (state.videoSource === 'webcam') {
      stopLaptopWebcam();
    } else {
      switchSourceTab('webcam');
      await startLaptopWebcam();
    }
  }

  // ========================================================
  // SOURCE 3: LIVE CCTV / IP CAMERA
  // ========================================================
  function setupCctvControls() {
    if (els.btnCctvTest) {
      els.btnCctvTest.addEventListener('click', testCctvConnection);
    }
    if (els.btnCctvConnect) {
      els.btnCctvConnect.addEventListener('click', connectCctvStream);
    }
    if (els.btnCctvDisconnect) {
      els.btnCctvDisconnect.addEventListener('click', disconnectCctvStream);
    }
    if (els.btnCctvReconnect) {
      els.btnCctvReconnect.addEventListener('click', () => {
        disconnectCctvStream();
        setTimeout(connectCctvStream, 500);
      });
    }
  }

  async function testCctvConnection() {
    const url = els.cctvStreamUrl ? els.cctvStreamUrl.value.trim() : '';
    const streamType = els.cctvStreamType ? els.cctvStreamType.value : 'http';
    const username = els.cctvUsername ? els.cctvUsername.value.trim() : '';
    const password = els.cctvPassword ? els.cctvPassword.value.trim() : '';

    if (!url) {
      alert('Please enter a valid camera stream URL.');
      return;
    }

    if (els.cctvStatusBanner) {
      els.cctvStatusBanner.className = 'cctv-status-banner status-testing';
      els.cctvStatusDot.className = 'status-indicator-dot testing';
      els.cctvStatusState.textContent = 'Testing connection...';
      els.cctvFeedbackMsg.textContent = 'Sending handshake request to IP camera / endpoint...';
    }

    try {
      const res = await fetch(`${API_BASE}/api/cctv/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, streamType, username, password })
      });
      const data = await res.json();

      if (data.success) {
        if (els.cctvStatusBanner) {
          els.cctvStatusBanner.className = 'cctv-status-banner status-connected';
          els.cctvStatusDot.className = 'status-indicator-dot connected';
          els.cctvStatusState.textContent = 'Connection Verified ✓';
          els.cctvLatencyTag.textContent = `${data.latencyMs}ms latency`;
          els.cctvFeedbackMsg.textContent = data.message || 'Stream reachable. Ready to connect.';
        }
      } else {
        if (els.cctvStatusBanner) {
          els.cctvStatusBanner.className = 'cctv-status-banner status-error';
          els.cctvStatusDot.className = 'status-indicator-dot error';
          els.cctvStatusState.textContent = 'Connection Failed ✗';
          els.cctvLatencyTag.textContent = data.latencyMs ? `${data.latencyMs}ms` : '';
          els.cctvFeedbackMsg.textContent = data.error || 'Endpoint did not respond. Check URL and credentials.';
        }
      }
    } catch (err) {
      if (els.cctvStatusBanner) {
        els.cctvStatusBanner.className = 'cctv-status-banner status-error';
        els.cctvStatusDot.className = 'status-indicator-dot error';
        els.cctvStatusState.textContent = 'Network Error';
        els.cctvFeedbackMsg.textContent = err.message;
      }
    }
  }

  async function connectCctvStream() {
    const url = els.cctvStreamUrl ? els.cctvStreamUrl.value.trim() : '';
    const streamType = els.cctvStreamType ? els.cctvStreamType.value : 'http';
    if (!url) {
      alert('Please enter a camera stream URL.');
      return;
    }

    releaseCurrentSource();

    if (els.cctvStatusBanner) {
      els.cctvStatusBanner.className = 'cctv-status-banner status-testing';
      els.cctvStatusDot.className = 'status-indicator-dot testing';
      els.cctvStatusState.textContent = 'Connecting stream...';
    }

    try {
      els.remoteVideo.crossOrigin = 'anonymous';
      els.remoteVideo.srcObject = null;
      els.remoteVideo.src = url;
      await els.remoteVideo.play();

      state.videoSource = 'cctv';
      const camName = (els.cctvCameraName && els.cctvCameraName.value.trim()) || 'CCTV Stream';
      updateVideoSourceHUD(`CCTV: ${camName}`);
      hideEmptyState();

      if (els.cctvStatusBanner) {
        els.cctvStatusBanner.className = 'cctv-status-banner status-connected';
        els.cctvStatusDot.className = 'status-indicator-dot connected';
        els.cctvStatusState.textContent = 'Streaming Live';
        els.cctvLastFrameTime.textContent = new Date().toLocaleTimeString();
        els.cctvFeedbackMsg.textContent = `Connected to ${streamType.toUpperCase()} stream: ${url}`;
      }

      if (els.btnCctvConnect) els.btnCctvConnect.style.display = 'none';
      if (els.btnCctvDisconnect) els.btnCctvDisconnect.style.display = 'block';
      if (els.btnCctvReconnect) els.btnCctvReconnect.style.display = 'block';
      if (els.dotSrcCctv) els.dotSrcCctv.className = 'src-status-dot live';

      els.cameraDot.className = 'pulse-dot live';
      els.cameraFeedText.textContent = `CAMERA: ${camName.toUpperCase()}`;
      els.cameraStreamBadge.textContent = 'CCTV LIVE';
    } catch (e) {
      console.warn('CCTV direct playback notice:', e);
      if (els.cctvStatusBanner) {
        els.cctvStatusBanner.className = 'cctv-status-banner status-error';
        els.cctvStatusDot.className = 'status-indicator-dot error';
        els.cctvStatusState.textContent = 'Direct Stream Playback Error';
        els.cctvFeedbackMsg.textContent = `Browser playback error: ${e.message}. For RTSP cameras, ensure camera outputs HTTP/MJPEG or HLS for web playback.`;
      }
    }
  }

  function disconnectCctvStream() {
    els.remoteVideo.pause();
    els.remoteVideo.removeAttribute('src');
    stopVideoFeed();

    if (els.cctvStatusBanner) {
      els.cctvStatusBanner.className = 'cctv-status-banner status-not-configured';
      els.cctvStatusDot.className = 'status-indicator-dot';
      els.cctvStatusState.textContent = 'Disconnected';
      els.cctvFeedbackMsg.textContent = 'CCTV stream disconnected.';
    }

    if (els.btnCctvConnect) els.btnCctvConnect.style.display = 'block';
    if (els.btnCctvDisconnect) els.btnCctvDisconnect.style.display = 'none';
    if (els.btnCctvReconnect) els.btnCctvReconnect.style.display = 'none';
    if (els.dotSrcCctv) els.dotSrcCctv.className = 'src-status-dot';
  }

  // ========================================================
  // SOURCE 4: SAMPLE VIDEO UPLOAD & REAL INFERENCE
  // ========================================================
  function setupSampleVideoControls() {
    if (!els.sampleDropzone || !els.sampleVideoFile) return;

    // Dropzone click -> file dialog
    els.sampleDropzone.addEventListener('click', () => {
      els.sampleVideoFile.click();
    });

    // File input change
    els.sampleVideoFile.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleSampleFile(e.target.files[0]);
      }
    });

    // Drag and drop events
    ['dragenter', 'dragover'].forEach(eventName => {
      els.sampleDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        els.sampleDropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      els.sampleDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        els.sampleDropzone.classList.remove('dragover');
      });
    });

    els.sampleDropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files[0]) {
        handleSampleFile(dt.files[0]);
      }
    });

    // Playback control buttons
    if (els.btnSamplePlayPause) {
      els.btnSamplePlayPause.addEventListener('click', toggleSamplePlayPause);
    }
    if (els.btnSampleRestart) {
      els.btnSampleRestart.addEventListener('click', restartSampleVideo);
    }
    if (els.btnSampleStop) {
      els.btnSampleStop.addEventListener('click', stopSampleVideo);
    }

    // Video timeupdate syncs seek slider and time text
    els.remoteVideo.addEventListener('timeupdate', () => {
      if (state.videoSource === 'sample' && !isNaN(els.remoteVideo.duration)) {
        if (els.sampleCurrentTime) els.sampleCurrentTime.textContent = formatVideoTime(els.remoteVideo.currentTime);
        if (els.sampleSeekSlider && !els.sampleSeekSlider.matches(':active')) {
          els.sampleSeekSlider.value = els.remoteVideo.currentTime;
        }
      }
    });

    // Seek slider interaction
    if (els.sampleSeekSlider) {
      els.sampleSeekSlider.addEventListener('input', (e) => {
        if (state.videoSource === 'sample') {
          els.remoteVideo.currentTime = parseFloat(e.target.value);
        }
      });
    }
  }

  function handleSampleFile(file) {
    if (!file) return;
    if (!file.type.includes('video') && !file.name.endsWith('.mp4') && !file.name.endsWith('.webm')) {
      alert('Please upload a valid MP4 or WebM video file.');
      return;
    }

    state.sampleFile = file;
    if (state.sampleVideoUrl) {
      URL.revokeObjectURL(state.sampleVideoUrl);
    }
    state.sampleVideoUrl = URL.createObjectURL(file);

    // Display file info
    if (els.sampleFileInfoBox) els.sampleFileInfoBox.style.display = 'block';
    if (els.sampleFileName) els.sampleFileName.textContent = file.name;
    if (els.sampleFileSize) els.sampleFileSize.textContent = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
    if (els.btnSamplePlayPause) els.btnSamplePlayPause.disabled = false;
    if (els.btnSampleRestart) els.btnSampleRestart.disabled = false;
    if (els.btnSampleStop) els.btnSampleStop.disabled = false;
    if (els.sampleSeekSlider) els.sampleSeekSlider.disabled = false;

    // Load file into video element
    releaseCurrentSource();
    els.remoteVideo.srcObject = null;
    els.remoteVideo.src = state.sampleVideoUrl;
    els.remoteVideo.loop = true;

    els.remoteVideo.onloadedmetadata = () => {
      const dur = els.remoteVideo.duration;
      if (els.sampleDuration) els.sampleDuration.textContent = formatVideoTime(dur);
      if (els.sampleSeekSlider) {
        els.sampleSeekSlider.max = dur;
        els.sampleSeekSlider.value = 0;
      }
      if (els.sampleCurrentTime) els.sampleCurrentTime.textContent = '00:00';
    };

    if (els.btnSamplePlayPause) els.btnSamplePlayPause.textContent = '▶ Start Processing';
  }

  function formatVideoTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  async function toggleSamplePlayPause() {
    if (!state.sampleVideoUrl) return;

    if (els.remoteVideo.paused) {
      state.videoSource = 'sample';
      hideEmptyState();
      try {
        await els.remoteVideo.play();
        if (els.btnSamplePlayPause) els.btnSamplePlayPause.textContent = '⏸ Pause Processing';
        if (els.dotSrcSample) els.dotSrcSample.className = 'src-status-dot live';
        updateVideoSourceHUD('Sample Video (Genuine AI Inference)');
        els.cameraDot.className = 'pulse-dot live';
        els.cameraFeedText.textContent = 'CAMERA: SAMPLE VIDEO';
        els.cameraStreamBadge.textContent = 'SAMPLE VIDEO';
      } catch (e) {
        console.warn('Sample video play error:', e);
      }
    } else {
      els.remoteVideo.pause();
      if (els.btnSamplePlayPause) els.btnSamplePlayPause.textContent = '▶ Resume Processing';
      if (els.dotSrcSample) els.dotSrcSample.className = 'src-status-dot';
    }
  }

  function restartSampleVideo() {
    if (!state.sampleVideoUrl) return;
    els.remoteVideo.currentTime = 0;
    if (els.remoteVideo.paused) {
      toggleSamplePlayPause();
    }
  }

  function stopSampleVideo() {
    els.remoteVideo.pause();
    els.remoteVideo.currentTime = 0;
    els.remoteVideo.removeAttribute('src');
    if (state.sampleVideoUrl) {
      URL.revokeObjectURL(state.sampleVideoUrl);
      state.sampleVideoUrl = null;
    }
    state.sampleFile = null;
    if (els.sampleFileInfoBox) els.sampleFileInfoBox.style.display = 'none';
    if (els.btnSamplePlayPause) {
      els.btnSamplePlayPause.disabled = true;
      els.btnSamplePlayPause.textContent = '▶ Start Processing';
    }
    if (els.btnSampleRestart) els.btnSampleRestart.disabled = true;
    if (els.btnSampleStop) els.btnSampleStop.disabled = true;
    if (els.sampleSeekSlider) {
      els.sampleSeekSlider.disabled = true;
      els.sampleSeekSlider.value = 0;
    }
    if (els.sampleCurrentTime) els.sampleCurrentTime.textContent = '00:00';
    if (els.sampleDuration) els.sampleDuration.textContent = '00:00';
    if (els.dotSrcSample) els.dotSrcSample.className = 'src-status-dot';
    stopVideoFeed();
  }

  function hideEmptyState() {
    els.emptyState.style.opacity = '0';
    els.emptyState.style.pointerEvents = 'none';
  }

  function showEmptyState() {
    els.emptyState.style.opacity = '1';
    els.emptyState.style.pointerEvents = 'auto';
    canvasCtx.clearRect(0, 0, els.detectionCanvas.width, els.detectionCanvas.height);
  }

  function stopVideoFeed() {
    state.videoSource = 'none';
    els.remoteVideo.srcObject = null;
    els.remoteVideo.removeAttribute('src');
    updateVideoSourceHUD('No Signal');
    els.hudResolution.textContent = '--';
    els.hudFps.textContent = '-- FPS';
    showEmptyState();
    // Reset counts and update UI (was: updateHumanCount which does not exist)
    state.currentHumanCount = 0;
    state.currentQueueCount = 0;
    state.currentDiningCount = 0;
    state.currentRawCount = 0;
    updateUIWithCounts();
    scheduleServerPush();
  }

  function updateVideoSourceHUD(sourceText) {
    els.hudSource.textContent = sourceText.toUpperCase();
    els.heroSourceDisplay.textContent = sourceText;
    if (sourceText !== 'No Signal') {
      els.hudStreamDot.style.background = '#10b981';
    } else {
      els.hudStreamDot.style.background = '#f43f5e';
    }
  }

  function updateMobileConnectionStatus(type, text) {
    els.mobileStatusPill.className = `conn-status-pill status-${type}`;
    els.mobileStatusText.textContent = text;
  }

  // ========================================================
  // TENSORFLOW.JS COCO-SSD DETECTION ENGINE
  // ========================================================
  async function loadDetectionModel() {
    els.modelHealthVal.textContent = 'Loading COCO-SSD...';
    els.modelHealthVal.style.color = '#fbbf24';

    try {
      state.model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
      state.isModelLoading = false;
      els.modelHealthVal.textContent = 'COCO-SSD Ready (lite_mobilenet_v2)';
      els.modelHealthVal.style.color = '#34d399';
      console.log('[Vision] TensorFlow.js COCO-SSD ready.');
    } catch (err) {
      console.warn('[Vision] Fallback to standard COCO-SSD model:', err);
      try {
        state.model = await cocoSsd.load();
        state.isModelLoading = false;
        els.modelHealthVal.textContent = 'COCO-SSD Ready (Default Base)';
        els.modelHealthVal.style.color = '#34d399';
      } catch (err2) {
        els.modelHealthVal.textContent = 'Model Load Error';
        els.modelHealthVal.style.color = '#f87171';
      }
    }
  }

  // ========================================================
  // INFERENCE & RENDERING LOOP
  // ========================================================
  async function detectionLoop() {
    if (state.isMonitoring && !state.isModelLoading && state.model && state.videoSource !== 'none') {
      const video = els.remoteVideo;

      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !video.paused) {
        if (els.detectionCanvas.width !== video.videoWidth || els.detectionCanvas.height !== video.videoHeight) {
          els.detectionCanvas.width = video.videoWidth;
          els.detectionCanvas.height = video.videoHeight;
          els.hudResolution.textContent = `${video.videoWidth}x${video.videoHeight}`;
        }

        const now = performance.now();
        const delta = now - state.lastFrameTime;
        state.lastFrameTime = now;
        if (delta > 0) {
          state.fpsHistory.push(1000 / delta);
          if (state.fpsHistory.length > 10) state.fpsHistory.shift();
          state.fps = Math.round(state.fpsHistory.reduce((a, b) => a + b, 0) / state.fpsHistory.length);
          els.hudFps.textContent = `${state.fps} FPS`;
          els.kpiFps.textContent = `${state.fps}`;
        }

        try {
          const inferStart = performance.now();
          const predictions = await state.model.detect(video);
          state.inferenceLatency = Math.round(performance.now() - inferStart);
          els.diagLatency.textContent = `${state.inferenceLatency} ms`;
          els.latencyHealthVal.textContent = `${state.inferenceLatency} ms`;

          // FILTER: Person class only with score >= confidenceThreshold
          const persons = predictions.filter(
            p => p.class === 'person' && p.score >= state.confidenceThreshold
          );

          // Render cyber bounding boxes with multi-zone ROI colors
          renderBoundingBoxes(persons, video.videoWidth, video.videoHeight);

          // Classify persons into Zones (Queue vs Dining tables)
          processDetections(persons, video.videoWidth, video.videoHeight);

        } catch (e) {
          console.warn('[Vision] Detection cycle error:', e);
        }
      }
    } else if (state.isDemoMode) {
      // In Demo Mode, render synthetic bounding boxes
      renderDemoSimulation();
    }

    requestAnimationFrame(detectionLoop);
  }

  // ========================================================
  // SPATIAL ZONE CLASSIFICATION & BOUNDING BOXES
  // ========================================================
  function renderBoundingBoxes(persons, width, height) {
    canvasCtx.clearRect(0, 0, width, height);

    // Render Zone Overlay Boundaries if enabled
    if (state.showZonesOverlay) {
      renderZoneOverlay(width, height);
    }

    if (!state.showBoxes && !state.showLabels) return;

    persons.forEach(person => {
      const [x, y, w, h] = person.bbox;
      const score = Math.round(person.score * 100);

      // Determine center coordinate
      const cx = x + w / 2;
      const cy = y + h / 2;
      const isQueueZone = cy < (height * 0.45); // Top 45% of viewport is serving counter/queue

      const primaryColor = isQueueZone ? '#38bdf8' : '#10b981';
      const fillColor = isQueueZone ? 'rgba(56, 189, 248, 0.12)' : 'rgba(16, 185, 129, 0.1)';

      if (state.showBoxes) {
        // Semi-transparent neon fill
        canvasCtx.fillStyle = fillColor;
        canvasCtx.fillRect(x, y, w, h);

        // Main bounding box border
        canvasCtx.strokeStyle = primaryColor;
        canvasCtx.lineWidth = 2;
        canvasCtx.strokeRect(x, y, w, h);

        // Cyberpunk Corner Brackets
        const cornerLen = Math.min(w * 0.22, h * 0.22, 18);
        canvasCtx.lineWidth = 3.5;
        canvasCtx.strokeStyle = isQueueZone ? '#00f0ff' : '#34d399';

        // Top-Left
        canvasCtx.beginPath();
        canvasCtx.moveTo(x, y + cornerLen);
        canvasCtx.lineTo(x, y);
        canvasCtx.lineTo(x + cornerLen, y);
        canvasCtx.stroke();

        // Top-Right
        canvasCtx.beginPath();
        canvasCtx.moveTo(x + w - cornerLen, y);
        canvasCtx.lineTo(x + w, y);
        canvasCtx.lineTo(x + w, y + cornerLen);
        canvasCtx.stroke();

        // Bottom-Left
        canvasCtx.beginPath();
        canvasCtx.moveTo(x, y + h - cornerLen);
        canvasCtx.lineTo(x, y + h);
        canvasCtx.lineTo(x + cornerLen, y + h);
        canvasCtx.stroke();

        // Bottom-Right
        canvasCtx.beginPath();
        canvasCtx.moveTo(x + w - cornerLen, y + h);
        canvasCtx.lineTo(x + w, y + h);
        canvasCtx.lineTo(x + w, y + h - cornerLen);
        canvasCtx.stroke();
      }

      if (state.showLabels) {
        const zoneTag = isQueueZone ? 'QUEUE' : 'DINING';
        const labelText = `👤 ${zoneTag} ${score}%`;
        canvasCtx.font = 'bold 13px "JetBrains Mono", monospace';
        const tagWidth = canvasCtx.measureText(labelText).width + 16;
        const tagHeight = 22;
        const tagY = y > tagHeight + 4 ? y - tagHeight - 2 : y + 2;

        // Pill background
        canvasCtx.fillStyle = 'rgba(6, 9, 19, 0.9)';
        canvasCtx.fillRect(x, tagY, tagWidth, tagHeight);
        canvasCtx.strokeStyle = primaryColor;
        canvasCtx.lineWidth = 1;
        canvasCtx.strokeRect(x, tagY, tagWidth, tagHeight);

        // Text
        canvasCtx.fillStyle = primaryColor;
        canvasCtx.fillText(labelText, x + 8, tagY + 15);
      }
    });
  }

  function renderZoneOverlay(width, height) {
    canvasCtx.save();
    const dividerY = height * 0.45;

    // Dotted boundary line dividing Serving Queue (Zone 1) and Dining Tables (Zone 2)
    canvasCtx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    canvasCtx.lineWidth = 1.5;
    canvasCtx.setLineDash([6, 6]);
    canvasCtx.beginPath();
    canvasCtx.moveTo(0, dividerY);
    canvasCtx.lineTo(width, dividerY);
    canvasCtx.stroke();

    // Zone tags
    canvasCtx.fillStyle = 'rgba(56, 189, 248, 0.8)';
    canvasCtx.font = 'bold 11px "Outfit", sans-serif';
    canvasCtx.fillText('▲ ZONE 1: FOOD SERVING COUNTER & QUEUE', 14, dividerY - 10);
    canvasCtx.fillStyle = 'rgba(16, 185, 129, 0.8)';
    canvasCtx.fillText('▼ ZONE 2: MAIN DINING TABLES SEATING', 14, dividerY + 20);

    canvasCtx.restore();
  }

  // ========================================================
  // PROCESS DETECTIONS & SMOOTHING
  // ========================================================
  function processDetections(persons, width, height) {
    const rawCount = persons.length;
    state.currentRawCount = rawCount;

    // Temporal Smoothing (Rolling Median Filter)
    if (state.smoothingWindowSize > 1) {
      state.recentCounts.push(rawCount);
      if (state.recentCounts.length > state.smoothingWindowSize) {
        state.recentCounts.shift();
      }
      const sorted = [...state.recentCounts].sort((a, b) => a - b);
      state.currentHumanCount = sorted[Math.floor(sorted.length / 2)];
    } else {
      state.currentHumanCount = rawCount;
    }

    // Spatial zone counts
    let queueCount = 0;
    let diningCount = 0;
    const dividerY = height * 0.45;

    persons.forEach(p => {
      const cy = p.bbox[1] + p.bbox[3] / 2;
      if (cy < dividerY) queueCount++;
      else diningCount++;
    });

    state.currentQueueCount = queueCount;
    state.currentDiningCount = diningCount;

    // Cumulative stats
    state.sessionCounts.push(state.currentHumanCount);
    if (state.currentHumanCount > state.sessionPeak) {
      state.sessionPeak = state.currentHumanCount;
    }

    if (persons.length > 0) {
      const avgScore = persons.reduce((acc, p) => acc + p.score, 0) / persons.length;
      state.confidenceSum += avgScore;
      state.totalDetectionsCount++;
    }

    updateUIWithCounts();
    scheduleServerPush();
  }

  // ========================================================
  // CORE UI SYNCHRONIZATION
  // ========================================================

  // ========================================================
  // QUEUE & ZONE LIVE HELPERS
  // ========================================================
  function updateCounterAllocationsUI(activeCounters, serviceSec) {
    if (!els.countersList) return;
    const rows = els.countersList.querySelectorAll('.counter-row');
    rows.forEach((row, idx) => {
      const badge = row.querySelector('.counter-badge');
      const infoSpan = row.querySelector('.counter-info span');
      const stat = row.querySelector('.counter-stat');
      const isActive = idx < activeCounters;

      if (isActive) {
        if (badge) {
          badge.className = 'counter-badge badge-active';
          badge.textContent = 'Counter #' + (idx + 1);
        }
        if (infoSpan) infoSpan.textContent = 'Active • Moving fluidly (~' + Math.round(serviceSec) + 's avg)';
        if (stat) {
          stat.className = 'counter-stat text-emerald';
          stat.textContent = '✓ Optimal';
        }
      } else {
        if (badge) {
          badge.className = 'counter-badge badge-standby';
          badge.textContent = 'Counter #' + (idx + 1);
        }
        if (infoSpan) infoSpan.textContent = 'Standby • Ready to activate during peak';
        if (stat) {
          stat.className = 'counter-stat text-muted';
          stat.textContent = 'Standby';
        }
      }
    });
  }

  let lastLoggedAlertTier = null;
  let lastLoggedQueueAlertTime = 0;
  let lastLoggedDiningAlertTime = 0;

  function checkAndTriggerLiveAlerts(tier, qCount, diningCount) {
    const now = Date.now();
    // 1. Crowd tier shift alert
    if (lastLoggedAlertTier && lastLoggedAlertTier !== tier) {
      const sevMap = { LOW: 'INFO', MODERATE: 'INFO', HIGH: 'WARNING', CRITICAL: 'CRITICAL' };
      const waitEst = Math.max(1, Math.round((qCount * state.serviceSecondsPerPerson) / (state.activeCounters * 60)));
      const newEvt = {
        id: 'evt-tier-' + now,
        timestamp: new Date().toISOString(),
        type: 'CROWD_LEVEL_CHANGE',
        severity: sevMap[tier] || 'INFO',
        title: 'Mess Crowd Level Shifted to ' + tier,
        message: 'Occupancy reached ' + state.currentHumanCount + '/' + state.capacity + ' (' + Math.round((state.currentHumanCount / state.capacity) * 100) + '%). Estimated queue wait: ~' + waitEst + ' min.'
      };
      state.events.unshift(newEvt);
      if (state.events.length > 60) state.events.pop();
      renderEventsList();
    }
    lastLoggedAlertTier = tier;

    // 2. Queue surge alert
    if (qCount >= 22 && (now - lastLoggedQueueAlertTime > 45000)) {
      lastLoggedQueueAlertTime = now;
      const surgeEvt = {
        id: 'evt-queue-' + now,
        timestamp: new Date().toISOString(),
        type: 'QUEUE_SURGE',
        severity: 'WARNING',
        title: 'Counter Queue Congestion Warning',
        message: 'Serving line in Zone 1 reached ' + qCount + ' students across ' + state.activeCounters + ' active counters. Line delays expected.'
      };
      state.events.unshift(surgeEvt);
      if (state.events.length > 60) state.events.pop();
      renderEventsList();
    }

    // 3. Dining hall capacity alert
    if (diningCount >= 115 && (now - lastLoggedDiningAlertTime > 60000)) {
      lastLoggedDiningAlertTime = now;
      const diningEvt = {
        id: 'evt-dining-' + now,
        timestamp: new Date().toISOString(),
        type: 'ZONE_CONGESTION',
        severity: 'WARNING',
        title: 'Zone 2 Dining Seating Exceeds 80%',
        message: 'Main dining hall has ' + diningCount + '/140 occupied seats. Consider directing students to express seating.'
      };
      state.events.unshift(diningEvt);
      if (state.events.length > 60) state.events.pop();
      renderEventsList();
    }
  }

  function getSeedEvents() {
    const now = Date.now();
    return [
      {
        id: 'evt-seed-1',
        timestamp: new Date(now - 1000 * 80).toISOString(),
        type: 'QUEUE_SURGE',
        severity: 'WARNING',
        title: 'Counter Queue Congestion Detected',
        message: 'Serving line exceeds 20 students. Demand peak detected in Zone 1 food serving area.'
      },
      {
        id: 'evt-seed-2',
        timestamp: new Date(now - 1000 * 60 * 5).toISOString(),
        type: 'CROWD_LEVEL_CHANGE',
        severity: 'INFO',
        title: 'Mess Crowd Level Shifted to MODERATE',
        message: 'Occupancy reached 115/220 (52%). Wait time estimated at ~5 min across 3 active counters.'
      },
      {
        id: 'evt-seed-3',
        timestamp: new Date(now - 1000 * 60 * 18).toISOString(),
        type: 'ZONE_CONGESTION',
        severity: 'WARNING',
        title: 'Dining Tables Occupancy at 70%',
        message: 'Zone 2 main hall table occupancy approaching peak lunchtime capacity.'
      },
      {
        id: 'evt-seed-4',
        timestamp: new Date(now - 1000 * 60 * 35).toISOString(),
        type: 'SYSTEM',
        severity: 'INFO',
        title: 'MESSPULSE AI Vision Pipeline Online',
        message: 'Spatial polygon tracking active. YOLOv8 / COCO-SSD detection models calibrated.'
      }
    ];
  }

  function updateUIWithCounts() {
    const count = state.currentHumanCount;
    const capacity = state.capacity;
    const pct = Math.min(100, Math.round((count / capacity) * 100));
    const availableSeats = Math.max(0, capacity - count);

    // Hero Overview Numbers
    els.heroOccupancyNum.textContent = count;
    els.heroCapacityNum.textContent = capacity;
    els.heroSeatsLeft.textContent = `${availableSeats} Seats Available`;
    els.heroPct.textContent = `${pct}%`;

    // SVG Circular Gauge Stroke Animation
    // Circumference = 2 * PI * r = 2 * 3.14159 * 82 = ~515
    const circumference = 515;
    const offset = circumference - (pct / 100) * circumference;
    els.gaugeFillCircle.style.strokeDashoffset = offset;

    // Crowd Tier Classification
    const { lowMax, moderateMax, highMax } = state.thresholds;
    let tier = 'LOW';
    let tierClass = 'tier-low';
    let gaugeColor = '#10b981';

    if (count <= lowMax) {
      tier = 'LOW';
      tierClass = 'tier-low';
      gaugeColor = '#10b981';
    } else if (count <= moderateMax) {
      tier = 'MODERATE';
      tierClass = 'tier-medium';
      gaugeColor = '#f59e0b';
    } else if (count <= highMax) {
      tier = 'HIGH';
      tierClass = 'tier-high';
      gaugeColor = '#f97316';
      playChimeAlert('HIGH');
    } else {
      tier = 'CRITICAL';
      tierClass = 'tier-vhigh';
      gaugeColor = '#f43f5e';
      playChimeAlert('CRITICAL');
    }

    els.heroTierPill.textContent = `CROWD LEVEL: ${tier}`;
    els.heroTierPill.className = `crowd-tier-pill ${tierClass}`;
    els.gaugeFillCircle.style.stroke = gaugeColor;

    els.heroSmoothingNote.textContent = `Raw: ${state.currentRawCount} | Smoothed Window: ${state.smoothingWindowSize}f`;
    els.hudDetectedCount.textContent = `${count} Detected`;

    // Wait Time & Queue Calculations
    const qCount = state.currentQueueCount;
    const activeCounters = Math.max(1, state.activeCounters);
    const serviceSec = Math.max(15, state.serviceSecondsPerPerson);
    const waitMins = Math.max(1, Math.round((qCount * serviceSec) / (activeCounters * 60)));

    els.waitLargeNum.textContent = `~${waitMins}`;
    els.waitQueueCount.textContent = `${qCount} students`;
    els.waitActiveCounters.textContent = `${activeCounters} lines open`;
    els.waitServiceRate.textContent = `${serviceSec}s / meal`;

    if (qCount > 25) {
      els.waitStatusPill.className = 'wait-status-pill pill-red';
      els.waitStatusPill.textContent = 'HEAVY CONGESTION';
    } else if (qCount > 10) {
      els.waitStatusPill.className = 'wait-status-pill pill-amber';
      els.waitStatusPill.textContent = 'STEADY LINE';
    } else {
      els.waitStatusPill.className = 'wait-status-pill pill-green';
      els.waitStatusPill.textContent = 'FLUID SERVICE';
    }

    // Recommendation card
    if (pct >= 85 || waitMins > 15) {
      els.heroRecCard.style.borderLeftColor = '#f43f5e';
      els.recHeadline.textContent = 'Dining hall at peak congestion. Waiting advised.';
      els.recBody.textContent = `Queue waiting time is currently ~${waitMins} min. Tables are nearing capacity. For faster dining, consider visiting in 20-30 minutes.`;
      els.recSuggestedTime.textContent = 'In 25-30 mins';
    } else if (pct >= 60 || waitMins > 8) {
      els.heroRecCard.style.borderLeftColor = '#f59e0b';
      els.recHeadline.textContent = 'Crowd is steadily increasing. Visit shortly.';
      els.recBody.textContent = `Lines are moving normally with an estimated ~${waitMins} min wait. Consider heading down soon before the 1:00 PM peak rush.`;
      els.recSuggestedTime.textContent = 'Within 10 mins';
    } else {
      els.heroRecCard.style.borderLeftColor = '#10b981';
      els.recHeadline.textContent = 'Conditions look comfortable. Consider going now.';
      els.recBody.textContent = 'Mess seating is widely available and serving queues are moving without delay. This is an optimal window for swift dining.';
      els.recSuggestedTime.textContent = 'Immediate (Now)';
    }

    // KPIs
    els.kpiOccupancy.textContent = count;
    els.kpiOccupancyPct.textContent = `${pct}% of max capacity`;
    els.kpiQueue.textContent = qCount;
    els.kpiPeak.textContent = state.sessionPeak;
    if (state.sessionCounts.length > 0) {
      const avg = (state.sessionCounts.reduce((a, b) => a + b, 0) / state.sessionCounts.length).toFixed(1);
      els.kpiAverage.textContent = avg;
    }
    if (state.totalDetectionsCount > 0) {
      const avgConf = Math.round((state.confidenceSum / state.totalDetectionsCount) * 100);
      els.kpiConfidence.textContent = `${avgConf}%`;
    }

    // Queue Intel Tab
    els.qIntelQueueLength.textContent = qCount;
    els.qIntelWaitMins.textContent = `~${waitMins}`;
    const throughput = ((activeCounters * 60) / serviceSec).toFixed(1);
    els.qIntelThroughput.textContent = throughput;

    // Queue Intel Growth Rate & Flow Tag
    if (els.qIntelGrowthRate) {
      const history = state.trendHistory30s;
      let delta = 0;
      if (history && history.length >= 10) {
        delta = count - history[history.length - 10].occ;
      }
      if (delta >= 4) {
        els.qIntelGrowthRate.textContent = 'Surging (+' + delta + '/m)';
        els.qIntelGrowthRate.style.color = '#f43f5e';
      } else if (delta > 0) {
        els.qIntelGrowthRate.textContent = 'Growing (+' + delta + '/m)';
        els.qIntelGrowthRate.style.color = '#f59e0b';
      } else if (delta <= -4) {
        els.qIntelGrowthRate.textContent = 'Rapid Clearing (' + delta + '/m)';
        els.qIntelGrowthRate.style.color = '#10b981';
      } else if (delta < 0) {
        els.qIntelGrowthRate.textContent = 'Clearing (' + delta + '/m)';
        els.qIntelGrowthRate.style.color = '#10b981';
      } else {
        els.qIntelGrowthRate.textContent = 'Stable (±0/m)';
        els.qIntelGrowthRate.style.color = '#38bdf8';
      }
    }

    if (els.queueSeverityTag) {
      if (qCount >= 25) {
        els.queueSeverityTag.className = 'queue-status-tag';
        els.queueSeverityTag.style.background = 'rgba(244, 63, 94, 0.15)';
        els.queueSeverityTag.style.color = '#f43f5e';
        els.queueSeverityTag.style.borderColor = 'rgba(244, 63, 94, 0.4)';
        els.queueSeverityTag.textContent = 'FLOW: SEVERE DELAY';
      } else if (qCount >= 12) {
        els.queueSeverityTag.className = 'queue-status-tag';
        els.queueSeverityTag.style.background = 'rgba(245, 158, 11, 0.15)';
        els.queueSeverityTag.style.color = '#f59e0b';
        els.queueSeverityTag.style.borderColor = 'rgba(245, 158, 11, 0.4)';
        els.queueSeverityTag.textContent = 'FLOW: MODERATE DELAY';
      } else {
        els.queueSeverityTag.className = 'queue-status-tag tag-fluid';
        els.queueSeverityTag.style.background = '';
        els.queueSeverityTag.style.color = '';
        els.queueSeverityTag.style.borderColor = '';
        els.queueSeverityTag.textContent = 'FLOW: FLUID & OPTIMAL';
      }
    }

    // Dynamic Counter Allocations in Queue Tab
    updateCounterAllocationsUI(activeCounters, serviceSec);

    // Zones Tab Updates
    els.zoneCounterCount.textContent = qCount;
    els.zoneCounterBar.style.width = Math.min(100, Math.round((qCount / 45) * 100)) + '%';
    els.zoneCounterCongestion.textContent = qCount > 20 ? 'Congested Line' : qCount > 8 ? 'Moderate Flow' : 'Fluid Flow';

    const diningCount = Math.max(0, count - qCount);
    els.zoneDiningCount.textContent = diningCount;
    els.zoneDiningBar.style.width = Math.min(100, Math.round((diningCount / 140) * 100)) + '%';
    els.zoneDiningCongestion.textContent = diningCount > 100 ? 'High Occupancy' : diningCount > 50 ? 'Steady Occupancy' : 'Comfortable Seating';

    // Zone 3: Express Snack Bar
    const expressCount = Math.min(20, Math.round(count * 0.12));
    if (els.zoneExpressCount) els.zoneExpressCount.textContent = expressCount;
    if (els.zoneExpressBar) els.zoneExpressBar.style.width = Math.min(100, Math.round((expressCount / 20) * 100)) + '%';
    if (els.zoneExpressCongestion) {
      els.zoneExpressCongestion.textContent = expressCount > 15 ? 'High Demand' : expressCount > 7 ? 'Active Line' : 'Normal Flow';
    }

    // Zone 4: Entrance & Waiting Vestibule
    const entryCount = Math.min(15, Math.round(count * 0.08));
    if (els.zoneEntryCount) els.zoneEntryCount.textContent = entryCount;
    if (els.zoneEntryBar) els.zoneEntryBar.style.width = Math.min(100, Math.round((entryCount / 15) * 100)) + '%';
    if (els.zoneEntryCongestion) {
      els.zoneEntryCongestion.textContent = entryCount > 10 ? 'Congested Entry' : entryCount > 4 ? 'Steady Flow' : 'Clear Entry';
    }

    // Update Zone Floor Plan Status Dots
    if (els.fpZoneCounter) {
      const dot = els.fpZoneCounter.querySelector('.zone-status-dot');
      if (dot) dot.className = 'zone-status-dot ' + (qCount > 20 ? 'dot-vhigh' : qCount > 8 ? 'dot-med' : 'dot-low');
    }
    if (els.fpZoneDining) {
      const dot = els.fpZoneDining.querySelector('.zone-status-dot');
      if (dot) dot.className = 'zone-status-dot ' + (diningCount > 100 ? 'dot-vhigh' : diningCount > 50 ? 'dot-med' : 'dot-low');
    }
    if (els.fpZoneExpress) {
      const dot = els.fpZoneExpress.querySelector('.zone-status-dot');
      if (dot) dot.className = 'zone-status-dot ' + (expressCount > 15 ? 'dot-vhigh' : expressCount > 7 ? 'dot-med' : 'dot-low');
    }
    if (els.fpZoneEntry) {
      const dot = els.fpZoneEntry.querySelector('.zone-status-dot');
      if (dot) dot.className = 'zone-status-dot ' + (entryCount > 10 ? 'dot-vhigh' : entryCount > 4 ? 'dot-med' : 'dot-low');
    }

    // Live Alert Generation
    checkAndTriggerLiveAlerts(tier, qCount, diningCount);

    // AI Insights & Forecast Calculations
    updateAIInsights(count, qCount, activeCounters, serviceSec, pct);
  }

  function updateAIInsights(count, qCount, activeCounters, serviceSec, pct) {
    if (!els.velocityTitle) return;

    // 1. Calculate velocity delta over the last 15 seconds from trendHistory30s
    const history = state.trendHistory30s;
    let delta = 0;
    if (history && history.length >= 15) {
      const pastOcc = history[history.length - 15].occ;
      delta = count - pastOcc;
    }

    if (delta >= 6) {
      els.velocityTitle.textContent = `Inflow Surge (+${delta} in 15s)`;
      els.velocityTitle.style.color = '#fbbf24';
      els.velocityText.textContent = `Rapid crowd acceleration detected. Food serving queues are projected to lengthen in ~4-6 minutes.`;
    } else if (delta <= -6) {
      els.velocityTitle.textContent = `Rapid Outflow (${delta} in 15s)`;
      els.velocityTitle.style.color = '#34d399';
      els.velocityText.textContent = `Significant seating clearance observed as students finish dining. Queue pressure easing.`;
    } else {
      els.velocityTitle.textContent = 'Arrival Velocity: Stable';
      els.velocityTitle.style.color = '#ffffff';
      els.velocityText.textContent = 'Net student arrival rate is currently balanced with meal departures. Seating capacity is holding steady.';
    }

    // 2. Queue Clearance calculation (Little's Law)
    const clearanceMinutes = Math.max(0.5, (qCount * serviceSec) / (activeCounters * 60)).toFixed(1);
    els.queueClearanceTitle.textContent = `Queue Clearance: ~${clearanceMinutes} mins`;
    if (qCount > 20) {
      els.queueClearanceTitle.style.color = '#f87171';
      els.queueClearanceText.textContent = `High queue pressure (${qCount} students). Clearance requires ~${clearanceMinutes} mins across ${activeCounters} active counters.`;
    } else {
      els.queueClearanceTitle.style.color = '#ffffff';
      els.queueClearanceText.textContent = `Serving lines are operating fluidly. Target clearance time will remain under ${Math.ceil(parseFloat(clearanceMinutes)) + 2} minutes.`;
    }

    // 3. Peak Window Prediction
    const currentHour = new Date().getHours();
    if (currentHour >= 12 && currentHour < 15) {
      els.peakForecastTitle.textContent = 'Lunch Peak: 1:15 PM Window';
      els.peakForecastText.textContent = pct > 75 
        ? 'Currently in primary lunch rush. Expect sustained queue demand until ~1:45 PM.' 
        : 'Approaching peak lunch influx window. Best time to visit is before 12:45 PM.';
    } else if (currentHour >= 19 && currentHour < 22) {
      els.peakForecastTitle.textContent = 'Dinner Peak: 8:15 PM Window';
      els.peakForecastText.textContent = 'Dinner rush exhibits high clustering between 8:00 PM and 8:45 PM. Optimal seating after 8:50 PM.';
    } else {
      els.peakForecastTitle.textContent = 'Off-Peak Interval Active';
      els.peakForecastText.textContent = 'Current dining operations are outside standard meal peak hours. Comfortable seating available.';
    }
  }

  // ========================================================
  // SERVER PUSH & MULTI-DEVICE SYNC
  // ========================================================
  function scheduleServerPush() {
    const now = Date.now();
    if (now - state.lastServerPush < 800) return; // Push at most once every 800ms
    state.lastServerPush = now;

    const count = state.currentHumanCount;
    const capacity = state.capacity || 220;
    const pct = Math.min(100, Math.round((count / capacity) * 100));
    const qCount = state.currentQueueCount;
    const activeCounters = Math.max(1, state.activeCounters);
    const serviceSec = Math.max(15, state.serviceSecondsPerPerson);
    const waitMins = Math.max(1, Math.round((qCount * serviceSec) / (activeCounters * 60)));

    const { lowMax, moderateMax, highMax } = state.thresholds;
    let tier = 'LOW';
    if (count <= lowMax) tier = 'LOW';
    else if (count <= moderateMax) tier = 'MODERATE';
    else if (count <= highMax) tier = 'HIGH';
    else tier = 'CRITICAL';

    let suggestedTime = 'Immediate (Now)';
    let recAdvice = 'Mess seating is widely available and serving queues are moving without delay.';
    if (tier === 'CRITICAL' || count >= 180) {
      suggestedTime = 'After 25-30 mins';
      recAdvice = 'Seating capacity exhausted & queue bottleneck. Visiting later is strongly advised.';
    } else if (tier === 'HIGH' || count >= 130) {
      suggestedTime = 'Within 10 mins';
      recAdvice = 'Queues steadily lengthening. Arrive promptly to beat the surge before seating fills up.';
    }

    const payload = {
      messName: state.messName || 'Central Campus Dining Hall',
      capacity: capacity,
      occupancy: count,
      rawCount: state.currentRawCount,
      queueCount: qCount,
      occupancyPercent: pct,
      crowdLevel: tier,
      estimatedWaitMinutes: waitMins,
      activeCounters: activeCounters,
      serviceSecondsPerPerson: serviceSec,
      fps: state.fps,
      confidence: state.totalDetectionsCount > 0 ? Math.round((state.confidenceSum / state.totalDetectionsCount) * 100) : 0,
      cameraActive: state.videoSource !== 'none' || state.isDemoMode,
      videoSource: state.isDemoMode ? 'Synthetic Simulation' : (state.videoSource || 'Webcam'),
      isDemoMode: state.isDemoMode,
      lastUpdated: new Date().toISOString(),
      recommendation: {
        suggestedTime: suggestedTime,
        advice: recAdvice
      },
      announcement: state.announcement || ''
    };

    // 1. Cross-tab real-time sync for GitHub Pages
    try {
      localStorage.setItem('messpulse_live_state', JSON.stringify(payload));
    } catch (e) {}

    // 2. Direct HTTP push
    fetch(`${API_BASE}/api/occupancy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(err => console.warn('Server push notice:', err.message));
  }

  // ========================================================
  // TREND HISTORY & CANVAS RENDERING
  // ========================================================
  function startTrendHistoryRecorder() {
    setInterval(() => {
      const now = Date.now();
      const currentPoint = {
        time: now,
        occ: state.currentHumanCount,
        queue: state.currentQueueCount
      };

      // 30s buffer (every 1s)
      state.trendHistory30s.push(currentPoint);
      if (state.trendHistory30s.length > 30) state.trendHistory30s.shift();

      // 5m buffer (every 10s)
      if (now % 10000 < 1000) {
        state.trendHistory5m.push(currentPoint);
        if (state.trendHistory5m.length > 30) state.trendHistory5m.shift();
      }

      // 30m buffer (every 60s)
      if (now % 60000 < 1000) {
        state.trendHistory30m.push(currentPoint);
        if (state.trendHistory30m.length > 30) state.trendHistory30m.shift();
      }

      renderMainTrendChart();
    }, 1000);
  }

  function renderMainTrendChart() {
    const cvs = els.mainTrendCanvas;
    const ctx = trendCtx;
    const w = cvs.width = cvs.offsetWidth || 700;
    const h = cvs.height = cvs.offsetHeight || 180;

    ctx.clearRect(0, 0, w, h);

    const data = state.chartRange === '5m' ? state.trendHistory5m :
                 state.chartRange === '30m' ? state.trendHistory30m : state.trendHistory30s;

    if (!data || data.length < 2) return;

    const maxVal = Math.max(state.capacity, ...data.map(d => d.occ), 10);
    const stepX = w / (data.length - 1);

    // 1. Dotted Red Capacity Line
    const capY = h - (state.capacity / maxVal) * (h - 25) - 10;
    ctx.save();
    ctx.strokeStyle = 'rgba(214, 69, 69, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, capY);
    ctx.lineTo(w, capY);
    ctx.stroke();
    ctx.fillStyle = '#D64545';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(`CAPACITY: ${state.capacity}`, 8, capY - 4);
    ctx.restore();

    // 2. Occupancy Area Gradient & Line
    const occGradient = ctx.createLinearGradient(0, 0, 0, h);
    occGradient.addColorStop(0, 'rgba(22, 134, 91, 0.25)');
    occGradient.addColorStop(1, 'rgba(22, 134, 91, 0.0)');

    ctx.beginPath();
    ctx.moveTo(0, h);
    data.forEach((pt, i) => {
      const x = i * stepX;
      const y = h - (pt.occ / maxVal) * (h - 25) - 10;
      ctx.lineTo(x, y);
    });
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = occGradient;
    ctx.fill();

    // Occupancy Stroke
    ctx.beginPath();
    data.forEach((pt, i) => {
      const x = i * stepX;
      const y = h - (pt.occ / maxVal) * (h - 25) - 10;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#16865B';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 3. Queue Line (Primary Accent)
    ctx.beginPath();
    data.forEach((pt, i) => {
      const x = i * stepX;
      const y = h - (pt.queue / maxVal) * (h - 25) - 10;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#0879D9';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Latest Point Pulser
    const lastX = (data.length - 1) * stepX;
    const lastY = h - (data[data.length - 1].occ / maxVal) * (h - 25) - 10;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#16865B';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ========================================================
  // DEMONSTRATION MODE ENGINE
  // ========================================================
  function startDemoMode() {
    state.isDemoMode = true;
    els.demoModeBanner.style.display = 'flex';
    els.demoModeToggle.checked = true;
    els.demoLabelText.textContent = 'DEMO ACTIVE';
    els.cameraDot.className = 'pulse-dot waiting';
    els.cameraFeedText.textContent = 'MODE: DEMONSTRATION';
    els.cameraStreamBadge.textContent = 'DEMO STREAM';
    updateVideoSourceHUD('Demonstration Scenario (Simulation)');

    if (els.btnToggleDemoSource) els.btnToggleDemoSource.textContent = '⏹ Stop Simulation Scenario';
    if (els.dotSrcDemo) els.dotSrcDemo.className = 'src-status-dot live';

    // Switch video empty state to show simulation
    hideEmptyState();

    if (state.demoTimer) clearInterval(state.demoTimer);
    state.demoTick = 0;

    state.demoTimer = setInterval(() => {
      state.demoTick++;
      // Simulate realistic campus lunch crowd fluctuation
      // Sine wave with stochastic jitter
      const cycle = Math.sin(state.demoTick * 0.15);
      const simulatedCount = Math.max(12, Math.round(110 + cycle * 55 + (Math.random() * 8 - 4)));
      const simulatedQueue = Math.max(2, Math.round(simulatedCount * 0.28 + (Math.random() * 4 - 2)));

      state.currentHumanCount = simulatedCount;
      state.currentRawCount = simulatedCount;
      state.currentQueueCount = simulatedQueue;
      state.currentDiningCount = Math.max(0, simulatedCount - simulatedQueue);
      state.fps = 30;

      // Generate synthetic bounding boxes on canvas
      generateSyntheticBoxes(simulatedCount, simulatedQueue);

      updateUIWithCounts();
      scheduleServerPush();
    }, 1000);
  }

  function stopDemoMode() {
    state.isDemoMode = false;
    els.demoModeBanner.style.display = 'none';
    els.demoModeToggle.checked = false;
    els.demoLabelText.textContent = 'DEMO MODE';
    if (els.btnToggleDemoSource) els.btnToggleDemoSource.textContent = '▶ Start Simulation Scenario';
    if (els.dotSrcDemo) els.dotSrcDemo.className = 'src-status-dot';

    if (state.demoTimer) {
      clearInterval(state.demoTimer);
      state.demoTimer = null;
    }

    if (state.videoSource === 'none') {
      showEmptyState();
      els.cameraFeedText.textContent = 'CAMERA: STANDBY';
      els.cameraDot.className = 'pulse-dot waiting';
      // Reset counts and update UI (was: updateHumanCount which does not exist)
      state.currentHumanCount = 0;
      state.currentQueueCount = 0;
      state.currentDiningCount = 0;
      state.currentRawCount = 0;
      updateUIWithCounts();
      scheduleServerPush();
    }
  }

  function generateSyntheticBoxes(count, queueCount) {
    const w = els.detectionCanvas.width || 640;
    const h = els.detectionCanvas.height || 360;
    const boxes = [];

    // Queue zone boxes (top 45%)
    for (let i = 0; i < Math.min(queueCount, 12); i++) {
      boxes.push({
        bbox: [
          40 + i * (w / 14) + (Math.random() * 10 - 5),
          h * 0.15 + (Math.random() * 40 - 20),
          35 + Math.random() * 10,
          70 + Math.random() * 15
        ],
        score: 0.85 + Math.random() * 0.12,
        class: 'person'
      });
    }

    // Dining tables boxes (bottom 55%)
    const diningCount = count - queueCount;
    for (let i = 0; i < Math.min(diningCount, 18); i++) {
      boxes.push({
        bbox: [
          30 + (i % 6) * (w / 6.5) + (Math.random() * 15 - 7),
          h * 0.52 + Math.floor(i / 6) * (h * 0.2) + (Math.random() * 15 - 7),
          40 + Math.random() * 10,
          75 + Math.random() * 15
        ],
        score: 0.82 + Math.random() * 0.15,
        class: 'person'
      });
    }

    state.simulatedBoxes = boxes;
  }

  function renderDemoSimulation() {
    const w = els.detectionCanvas.width;
    const h = els.detectionCanvas.height;

    canvasCtx.clearRect(0, 0, w, h);

    // Draw dark simulation backdrop
    canvasCtx.fillStyle = 'rgba(6, 9, 19, 0.95)';
    canvasCtx.fillRect(0, 0, w, h);

    // Grid watermark
    canvasCtx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    canvasCtx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      canvasCtx.beginPath();
      canvasCtx.moveTo(x, 0);
      canvasCtx.lineTo(x, h);
      canvasCtx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      canvasCtx.beginPath();
      canvasCtx.moveTo(0, y);
      canvasCtx.lineTo(w, y);
      canvasCtx.stroke();
    }

    // Simulation watermark text
    canvasCtx.fillStyle = 'rgba(245, 158, 11, 0.4)';
    canvasCtx.font = 'bold 16px "JetBrains Mono", monospace';
    canvasCtx.fillText('MESSPULSE AI • SYNTHETIC SCENARIO SIMULATION', 20, 30);

    // Render bounding boxes & zone overlay
    renderBoundingBoxes(state.simulatedBoxes, w, h);
  }

  // ========================================================
  // AUDIO ALERT CHIME (WEB AUDIO API SYNTHESIZER)
  // ========================================================
  let lastChimeTime = 0;
  function playChimeAlert(level) {
    if (!state.audioAlerts) return;
    const now = Date.now();
    if (now - lastChimeTime < 10000) return; // 10s cooldown
    lastChimeTime = now;

    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = level === 'CRITICAL' ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(level === 'CRITICAL' ? 880 : 587.33, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
      // Audio autoplay policy
    }
  }

  // ========================================================
  // EVENTS & INCIDENTS CENTER
  // ========================================================
  async function fetchEvents() {
    try {
      const res = await fetch(`${API_BASE}/api/events`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.events && data.events.length > 0) {
          state.events = data.events;
          renderEventsList();
          return;
        }
      }
      throw new Error('Fallback to seed events');
    } catch (e) {
      if (!state.events || state.events.length === 0) {
        state.events = getSeedEvents();
      }
      renderEventsList();
    }
  }

  function renderEventsList() {
    const container = els.eventsListContainer;
    container.innerHTML = '';

    const filtered = state.events.filter(evt => {
      if (state.alertFilter === 'ALL') return true;
      return evt.severity === state.alertFilter;
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem;">No events matching "${state.alertFilter}"</div>`;
      return;
    }

    filtered.forEach(evt => {
      const row = document.createElement('div');
      const sevClass = evt.severity === 'CRITICAL' ? 'sev-critical' :
                       evt.severity === 'WARNING' ? 'sev-warning' : 'sev-info';
      const badgeClass = evt.severity === 'CRITICAL' ? 'sev-badge-critical' :
                         evt.severity === 'WARNING' ? 'sev-badge-warning' : 'sev-badge-info';

      row.className = `event-row ${sevClass}`;
      row.innerHTML = `
        <div class="event-main">
          <div class="event-title-row">
            <span class="event-sev-badge ${badgeClass}">${evt.severity}</span>
            <span class="event-title">${escapeHTML(evt.title)}</span>
          </div>
          <div class="event-desc">${escapeHTML(evt.message)}</div>
        </div>
        <div class="event-meta">
          <span class="event-time">${formatTimeAgo(evt.timestamp)}</span>
          <button class="event-ack-btn">Acknowledge</button>
        </div>
      `;

      row.querySelector('.event-ack-btn').addEventListener('click', (e) => {
        e.target.textContent = 'Acknowledged ✓';
        e.target.disabled = true;
        e.target.style.color = '#34d399';
      });

      container.appendChild(row);
    });

    els.unreadAlertCount.textContent = filtered.length;
  }

  // ========================================================
  // ANALYTICS HEATMAP & SETTINGS
  // ========================================================
  const defaultHourlyHeatmap = [
    { hour: '07:00', label: '7 AM', avg: 12, peak: 35, category: 'Breakfast Prep' },
    { hour: '08:00', label: '8 AM', avg: 78, peak: 140, category: 'Breakfast Peak' },
    { hour: '09:00', label: '9 AM', avg: 45, peak: 90, category: 'Breakfast Late' },
    { hour: '10:00', label: '10 AM', avg: 8, peak: 18, category: 'Closed' },
    { hour: '11:00', label: '11 AM', avg: 15, peak: 25, category: 'Lunch Prep' },
    { hour: '12:00', label: '12 PM', avg: 95, peak: 160, category: 'Lunch Rush' },
    { hour: '13:00', label: '1 PM', avg: 175, peak: 215, category: 'Lunch Peak' },
    { hour: '14:00', label: '2 PM', avg: 60, peak: 110, category: 'Lunch Winding Down' },
    { hour: '15:00', label: '3 PM', avg: 10, peak: 20, category: 'Closed' },
    { hour: '16:00', label: '4 PM', avg: 15, peak: 30, category: 'Snack Prep' },
    { hour: '17:00', label: '5 PM', avg: 65, peak: 115, category: 'Snack Rush' },
    { hour: '18:00', label: '6 PM', avg: 30, peak: 55, category: 'Dinner Prep' },
    { hour: '19:00', label: '7 PM', avg: 70, peak: 125, category: 'Dinner Early' },
    { hour: '20:00', label: '8 PM', avg: 185, peak: 220, category: 'Dinner Peak' },
    { hour: '21:00', label: '9 PM', avg: 50, peak: 85, category: 'Dinner Late' }
  ];

  function renderHeatmapGrid(hourlyData) {
    const grid = els.heatmapGrid;
    if (!grid) return;
    grid.innerHTML = '';
    (hourlyData || []).forEach(item => {
      const cell = document.createElement('div');
      cell.className = 'heat-cell';

      let chipClass = 'heat-1';
      if (item.avg > 140) chipClass = 'heat-4';
      else if (item.avg > 90) chipClass = 'heat-3';
      else if (item.avg > 40) chipClass = 'heat-2';

      cell.innerHTML = `
        <span class="heat-hour">${item.label}</span>
        <span class="heat-chip ${chipClass}"></span>
        <span class="heat-val">${item.avg}</span>
      `;
      cell.title = `${item.label}: Avg ${item.avg} students (${item.category})`;
      grid.appendChild(cell);
    });
  }

  async function loadAnalyticsHeatmap() {
    try {
      const res = await fetch(`${API_BASE}/api/analytics`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.hourlyHeatmap && data.hourlyHeatmap.length > 0) {
          renderHeatmapGrid(data.hourlyHeatmap);
          return;
        }
      }
      throw new Error('Fallback heatmap');
    } catch (e) {
      renderHeatmapGrid(defaultHourlyHeatmap);
    }
  }

  function loadSavedSettingsLocal() {
    try {
      const saved = localStorage.getItem('messpulse_settings');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.capacity) state.capacity = parseInt(data.capacity, 10);
        if (data.messName) {
          state.messName = data.messName;
          if (els.locationSelect && els.locationSelect.options[0]) {
            els.locationSelect.options[0].textContent = state.messName;
          }
        }
        if (data.activeCounters) state.activeCounters = parseInt(data.activeCounters, 10);
        if (data.serviceSecondsPerPerson) state.serviceSecondsPerPerson = parseInt(data.serviceSecondsPerPerson, 10);
        if (data.thresholds) state.thresholds = data.thresholds;
        if (data.announcement) state.announcement = data.announcement;

        // Populate settings form inputs immediately
        if (els.cfgMessName) els.cfgMessName.value = state.messName;
        if (els.cfgCapacity) els.cfgCapacity.value = state.capacity;
        if (els.cfgLowMax) els.cfgLowMax.value = state.thresholds.lowMax;
        if (els.cfgModerateMax) els.cfgModerateMax.value = state.thresholds.moderateMax;
        if (els.cfgHighMax) els.cfgHighMax.value = state.thresholds.highMax;
        if (els.cfgActiveCounters) els.cfgActiveCounters.value = state.activeCounters;
        if (els.cfgServiceSec) els.cfgServiceSec.value = state.serviceSecondsPerPerson;
        if (els.cfgAnnouncement && state.announcement) els.cfgAnnouncement.value = state.announcement;

        updateUIWithCounts();
      }
    } catch (e) {
      console.warn('LocalStorage settings load error:', e);
    }
  }

  async function fetchInitialSettings() {
    // 1. Immediately apply any locally saved settings
    loadSavedSettingsLocal();

    // 2. Fetch latest server settings if available
    try {
      const res = await fetch(`${API_BASE}/api/settings`);
      if (res.ok) {
        const data = await res.json();
        const hasLocal = localStorage.getItem('messpulse_settings');
        if (!hasLocal) {
          state.capacity = data.capacity || 220;
          state.messName = data.messName || 'Central Campus Dining Hall';
          state.activeCounters = data.activeCounters || 3;
          state.serviceSecondsPerPerson = data.serviceSecondsPerPerson || 45;
          if (data.thresholds) state.thresholds = data.thresholds;

          if (els.cfgMessName) els.cfgMessName.value = state.messName;
          if (els.cfgCapacity) els.cfgCapacity.value = state.capacity;
          if (els.cfgLowMax) els.cfgLowMax.value = state.thresholds.lowMax;
          if (els.cfgModerateMax) els.cfgModerateMax.value = state.thresholds.moderateMax;
          if (els.cfgHighMax) els.cfgHighMax.value = state.thresholds.highMax;
          if (els.cfgActiveCounters) els.cfgActiveCounters.value = state.activeCounters;
          if (els.cfgServiceSec) els.cfgServiceSec.value = state.serviceSecondsPerPerson;
          if (els.cfgAnnouncement) els.cfgAnnouncement.value = data.announcement || '';

          updateUIWithCounts();
        }
      }
    } catch (e) {
      console.warn('Initial server settings notice:', e.message);
    }
  }

  // ========================================================
  // SIMULATOR CONTROLS (QUEUE TAB)
  // ========================================================
  function setupSimulatorControls() {
    function updateSim() {
      const counters = parseInt(els.simCountersSlider.value, 10);
      const sec = parseInt(els.simServiceTimeSlider.value, 10);

      els.simCountersVal.textContent = counters;
      els.simServiceTimeVal.textContent = `${sec}s`;

      const throughput = ((counters * 60) / sec).toFixed(1);
      const clearTime = ((30 * sec) / (counters * 60)).toFixed(1);

      els.simThroughputRes.textContent = `${throughput} students/min`;
      els.simClearTimeRes.textContent = `${clearTime} mins`;
    }

    els.simCountersSlider.addEventListener('input', updateSim);
    els.simServiceTimeSlider.addEventListener('input', updateSim);
    updateSim();
  }

  // ========================================================
  // EVENT LISTENERS & HELPERS
  // ========================================================
  function setupEventListeners() {
    // Dining Hall Location Switcher
    if (els.locationSelect) {
      els.locationSelect.addEventListener('change', async (e) => {
        const chosen = e.target.value;
        let newName = 'Central Campus Dining Hall';
        let newCap = 220;
        let newCounters = 3;

        if (chosen === 'north-mess') {
          newName = 'North Block Dining Complex';
          newCap = 350;
          newCounters = 4;
        } else if (chosen === 'south-canteen') {
          newName = 'South Hostel Canteen & Express';
          newCap = 140;
          newCounters = 2;
        }

        state.messName = newName;
        state.capacity = newCap;
        state.activeCounters = newCounters;

        try {
          await fetch(`${API_BASE}/api/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messName: newName, capacity: newCap, activeCounters: newCounters })
          });
        } catch (err) {
          console.warn('Failed to update location settings:', err);
        }

        updateUIWithCounts();
      });
    }

    // Demo Mode Toggles
    els.demoModeToggle.addEventListener('change', (e) => {
      if (e.target.checked) startDemoMode();
      else stopDemoMode();
    });

    els.btnExitDemo.addEventListener('click', stopDemoMode);
    if (els.btnTriggerDemoFromStudio) {
      els.btnTriggerDemoFromStudio.addEventListener('click', () => {
        switchSourceTab('demo');
        startDemoMode();
      });
    }

    // Laptop Webcam Test
    els.btnTestWebcam.addEventListener('click', toggleLaptopWebcam);

    // Pause/Resume Detection
    els.btnStartStop.addEventListener('click', () => {
      state.isMonitoring = !state.isMonitoring;
      if (state.isMonitoring) {
        els.btnStartStop.textContent = '⏸ Pause Detection';
        els.monitorStatusText.textContent = 'LIVE MONITORING';
        els.monitorDot.className = 'pulse-dot live';
      } else {
        els.btnStartStop.textContent = '▶ Resume Detection';
        els.monitorStatusText.textContent = 'MONITORING PAUSED';
        els.monitorDot.className = 'pulse-dot waiting';
        canvasCtx.clearRect(0, 0, els.detectionCanvas.width, els.detectionCanvas.height);
      }
    });

    // Fullscreen Viewfinder
    els.btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        els.viewfinderWrapper.requestFullscreen().catch(err => console.warn(err));
      } else {
        document.exitFullscreen();
      }
    });

    // Copy URL Buttons
    els.btnCopyUrl.addEventListener('click', () => {
      navigator.clipboard.writeText(els.mobileUrlDisplay.value).then(() => {
        els.btnCopyUrl.textContent = 'Copied!';
        setTimeout(() => { els.btnCopyUrl.textContent = 'Copy'; }, 2000);
      });
    });

    els.btnCopyStudentUrl.addEventListener('click', () => {
      navigator.clipboard.writeText(els.studentDirectUrlDisplay.textContent).then(() => {
        els.btnCopyStudentUrl.textContent = 'Copied!';
        setTimeout(() => { els.btnCopyStudentUrl.textContent = 'Copy Student URL'; }, 2000);
      });
    });

    // Reconnect Signaling
    els.btnReconnect.addEventListener('click', () => {
      if (state.signaling) {
        state.signaling.disconnect();
        initSignaling();
      }
      updateMobileConnectionStatus('waiting', 'Reconnecting to server...');
    });

    // IP Selection
    if (els.ipSelect) {
      els.ipSelect.addEventListener('change', (e) => {
        loadNetworkConfig(e.target.value);
      });
    }

    // Sliders & Checkboxes
    els.confidenceSlider.addEventListener('input', (e) => {
      state.confidenceThreshold = parseFloat(e.target.value);
      els.confidenceValDisplay.textContent = `${Math.round(state.confidenceThreshold * 100)}%`;
    });

    els.smoothingSelect.addEventListener('change', (e) => {
      state.smoothingWindowSize = parseInt(e.target.value, 10);
      state.recentCounts = [];
    });

    els.toggleBoxes.addEventListener('change', (e) => { state.showBoxes = e.target.checked; });
    els.toggleLabels.addEventListener('change', (e) => { state.showLabels = e.target.checked; });
    els.toggleZonesOverlay.addEventListener('change', (e) => { state.showZonesOverlay = e.target.checked; });

    // Audio Chimes
    els.soundAlertToggle.addEventListener('change', (e) => {
      state.audioAlerts = e.target.checked;
      els.soundIcon.textContent = state.audioAlerts ? '🔔' : '🔕';
    });

    els.btnQuickSound.addEventListener('click', () => {
      state.audioAlerts = !state.audioAlerts;
      els.soundAlertToggle.checked = state.audioAlerts;
      els.soundIcon.textContent = state.audioAlerts ? '🔔' : '🔕';
    });

    els.btnTestSound.addEventListener('click', () => {
      playChimeAlert('HIGH');
    });

    // Chart Timeframe Buttons
    els.chartRangeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        els.chartRangeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.chartRange = btn.dataset.range;
        els.chartPointsCount.textContent = `Range: Last ${state.chartRange}`;
        renderMainTrendChart();
      });
    });

    // Alert Filter Buttons
    els.alertFilterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        els.alertFilterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.alertFilter = btn.dataset.filter;
        renderEventsList();
      });
    });

    // Snapshot
    els.btnSnapshot.addEventListener('click', () => {
      const snapCanvas = document.createElement('canvas');
      snapCanvas.width = els.remoteVideo.videoWidth || 640;
      snapCanvas.height = els.remoteVideo.videoHeight || 360;
      const snapCtx = snapCanvas.getContext('2d');
      snapCtx.drawImage(els.remoteVideo, 0, 0);
      snapCtx.drawImage(els.detectionCanvas, 0, 0);

      const link = document.createElement('a');
      link.download = `messpulse-audit-${Date.now()}.png`;
      link.href = snapCanvas.toDataURL();
      link.click();
    });

    // Export Session Data
    els.btnExportData.addEventListener('click', () => {
      const exportBlob = new Blob([JSON.stringify({
        messName: state.messName,
        capacity: state.capacity,
        exportTime: new Date().toISOString(),
        sessionPeak: state.sessionPeak,
        history: state.trendHistory30s
      }, null, 2)], { type: 'application/json' });

      const link = document.createElement('a');
      link.download = `messpulse-session-${Date.now()}.json`;
      link.href = URL.createObjectURL(exportBlob);
      link.click();
    });

    // Settings Form Submission
    els.settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const updates = {
        messName: els.cfgMessName.value.trim() || 'Central Campus Dining Hall',
        capacity: parseInt(els.cfgCapacity.value, 10) || 220,
        activeCounters: parseInt(els.cfgActiveCounters.value, 10) || 3,
        serviceSecondsPerPerson: parseInt(els.cfgServiceSec.value, 10) || 45,
        thresholds: {
          lowMax: parseInt(els.cfgLowMax.value, 10) || 65,
          moderateMax: parseInt(els.cfgModerateMax.value, 10) || 135,
          highMax: parseInt(els.cfgHighMax.value, 10) || 185
        },
        announcement: els.cfgAnnouncement ? els.cfgAnnouncement.value.trim() : ''
      };

      // 1. Instantly update client application state
      state.messName = updates.messName;
      state.capacity = updates.capacity;
      state.activeCounters = updates.activeCounters;
      state.serviceSecondsPerPerson = updates.serviceSecondsPerPerson;
      state.thresholds = updates.thresholds;
      state.announcement = updates.announcement;

      // 2. Persist to localStorage for 100% reliable persistence on GitHub Pages
      try {
        localStorage.setItem('messpulse_settings', JSON.stringify(updates));
      } catch (err) {
        console.warn('LocalStorage save error:', err);
      }

      // 3. Immediately reflect in all UI outputs (gauge, capacity, wait time, location header)
      if (els.locationSelect && els.locationSelect.options[0]) {
        els.locationSelect.options[0].textContent = state.messName;
      }
      updateUIWithCounts();

      // Show immediate confirmation to the user
      els.saveStatusMsg.textContent = 'Settings saved & applied successfully! ✓';
      els.saveStatusMsg.style.color = '#10b981';
      setTimeout(() => {
        if (els.saveStatusMsg.textContent.includes('applied')) {
          els.saveStatusMsg.textContent = '';
        }
      }, 3500);

      // 4. Also synchronize to cloud backend in background if reachable
      try {
        const res = await fetch(`${API_BASE}/api/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });
        if (res.ok) {
          els.saveStatusMsg.textContent = 'Settings saved & synchronized to cloud! ✓';
          els.saveStatusMsg.style.color = '#10b981';
          setTimeout(() => { els.saveStatusMsg.textContent = ''; }, 3000);
        }
      } catch (err) {
        console.log('Settings active locally in browser (cloud sync deferred):', err.message);
      }
    });
  }

  function startFreshnessTicker() {
    setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - state.lastSyncTime) / 1000);
      els.freshnessDisplay.textContent = elapsedSec < 2 ? '< 1s ago' : `${elapsedSec}s ago`;
    }, 1000);
  }

  function formatTimeAgo(isoString) {
    const elapsed = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (elapsed < 60) return `${elapsed}s ago`;
    if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ago`;
    return `${Math.floor(elapsed / 3600)}h ago`;
  }

  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  window.addEventListener('DOMContentLoaded', init);
})();
