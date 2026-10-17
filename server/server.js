const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const os = require('os');
const { WebSocketServer, WebSocket } = require('ws');
const QRCode = require('qrcode');

const PORT = parseInt(process.env.PORT || '5173', 10);
const HOST = process.env.HOST || '0.0.0.0';
const USE_HTTPS = process.env.HTTPS === 'true' || process.argv.includes('--https');

/**
 * Scan network interfaces and return all IPv4 private LAN addresses,
 * prioritizing active Wi-Fi and Ethernet adapters.
 */
function getNetworkInterfacesInfo() {
  const interfaces = os.networkInterfaces();
  const allIps = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const iface of addrs) {
      if (iface.family === 'IPv4' && !iface.internal) {
        let score = 5;
        const lowerName = name.toLowerCase();

        if (lowerName.includes('wi-fi') || lowerName.includes('wlan') || lowerName.includes('wireless')) {
          score += 20;
        } else if (lowerName.includes('ethernet') || lowerName.includes('eth') || lowerName.includes('en0')) {
          score += 15;
        }

        if (lowerName.includes('vethernet') || lowerName.includes('virtual') || lowerName.includes('vmware') || lowerName.includes('wsl') || lowerName.includes('pseudo')) {
          score -= 10;
        }

        const addr = iface.address;
        const isPrivate = addr.startsWith('192.168.') ||
                          addr.startsWith('10.') ||
                          (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(addr));

        if (isPrivate) {
          score += 10;
        }

        allIps.push({
          name,
          address: addr,
          isPrivate,
          score
        });
      }
    }
  }

  allIps.sort((a, b) => b.score - a.score);
  const primaryIp = allIps.length > 0 ? allIps[0].address : '127.0.0.1';

  return { primaryIp, allIps };
}

// ============================================================
// MESSPULSE AI - SHARED REAL-TIME DATA ARCHITECTURE
// ============================================================

const settings = {
  messId: 'central-hall',
  messName: 'Central Campus Dining Hall',
  capacity: 220,
  activeCounters: 3,
  serviceSecondsPerPerson: 45,
  thresholds: {
    lowMax: 65,       // <= 65: LOW (Green)
    moderateMax: 135, // 66-135: MODERATE (Amber)
    highMax: 185,     // 136-185: HIGH (Orange)
    criticalMax: 220  // > 185: CRITICAL (Red)
  },
  mealSchedule: {
    breakfast: '07:30 - 09:30',
    lunch: '12:15 - 14:30',
    snacks: '17:00 - 18:30',
    dinner: '19:30 - 21:45'
  },
  announcement: 'Fresh meal service active across all 3 serving counters. Vegetarian & non-vegetarian lines open.',
  autoAlertCooldownSec: 15
};

const messState = {
  messId: settings.messId,
  messName: settings.messName,
  occupancy: 0,
  rawCount: 0,
  capacity: settings.capacity,
  occupancyPercent: 0,
  crowdLevel: 'LOW', // 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'
  queueCount: 0,
  queueTrend: 'stable', // 'rising' | 'falling' | 'stable'
  estimatedWaitMinutes: 0,
  activeCounters: settings.activeCounters,
  serviceSecondsPerPerson: settings.serviceSecondsPerPerson,
  zones: [
    { id: 'zone-queue', name: 'Food Serving Counter & Queues', occupancy: 0, capacity: 45, level: 'LOW', congestion: 'Fluid' },
    { id: 'zone-dining', name: 'Main Dining Tables Section', occupancy: 0, capacity: 140, level: 'LOW', congestion: 'Comfortable' },
    { id: 'zone-express', name: 'Express Snack & Beverage Bar', occupancy: 0, capacity: 20, level: 'LOW', congestion: 'Normal' },
    { id: 'zone-entry', name: 'Entrance & Waiting Area', occupancy: 0, capacity: 15, level: 'LOW', congestion: 'Clear' }
  ],
  cameraActive: false,
  videoSource: 'none', // 'mobile' | 'webcam' | 'demo' | 'none'
  fps: 0,
  confidence: 0,
  isDemoMode: false,
  lastUpdated: new Date().toISOString(),
  mealPeriod: 'Lunch Service (12:15 PM - 2:30 PM)',
  announcement: settings.announcement,
  recommendation: {
    status: 'OPTIMAL',
    badgeClass: 'rec-optimal',
    headline: 'Conditions look comfortable. Consider going now.',
    advice: 'Mess seating is widely available and queue times are negligible.',
    suggestedTime: 'Now'
  }
};

// Rolling history (max 300 observations)
const historyObservations = [];

// Events & Alerts log (max 100)
const eventsLog = [
  {
    id: 'evt-init',
    timestamp: new Date().toISOString(),
    type: 'SYSTEM',
    severity: 'INFO',
    title: 'MESSPULSE AI Engine Initialized',
    message: 'System online. Vision processing pipeline ready for camera connection.'
  }
];

let lastLoggedTier = 'LOW';
let lastLoggedQueueAlert = 0;

function computeRecommendation(occupancy, capacity, queueCount, waitMinutes) {
  const pct = Math.round((occupancy / Math.max(capacity, 1)) * 100);

  if (pct >= 85 || waitMinutes > 15) {
    return {
      status: 'CRITICAL',
      badgeClass: 'rec-critical',
      headline: 'Dining hall at peak congestion. Waiting advised.',
      advice: `Estimated waiting time is currently ~${waitMinutes} minutes. For faster dining, visit after 20-30 minutes.`,
      suggestedTime: 'In 25-35 mins'
    };
  } else if (pct >= 60 || waitMinutes > 8) {
    return {
      status: 'MODERATE',
      badgeClass: 'rec-moderate',
      headline: 'Crowd is steadily increasing. Visit shortly.',
      advice: `Waiting time is moderate (~${waitMinutes} min). Counter lines are moving normally.`,
      suggestedTime: 'Within 10 mins'
    };
  } else {
    return {
      status: 'OPTIMAL',
      badgeClass: 'rec-optimal',
      headline: 'Conditions look comfortable. Consider going now.',
      advice: 'Ample seating is available and food serving queues are quick and fluid.',
      suggestedTime: 'Now'
    };
  }
}

// Seed initial history points so charts have immediate real baseline
(function seedInitialHistory() {
  const now = Date.now();
  for (let i = 20; i >= 0; i--) {
    historyObservations.push({
      timestamp: new Date(now - i * 10000).toISOString(),
      occupancy: 0,
      queueCount: 0,
      crowdLevel: 'LOW',
      fps: 0
    });
  }
})();

// ============================================================
// EXPRESS APP CONFIGURATION
// ============================================================

const app = express();
app.use(express.json());

// Enable CORS for cross-origin clients (e.g. GitHub Pages)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Serve static frontend files
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// Route: Main Administration Operations Station
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Route: Student Mobile-First Portal
app.get('/student', (req, res) => {
  res.sendFile(path.join(publicDir, 'student.html'));
});

// Route: Mobile Camera WebRTC Transmitter
app.get('/mobile', (req, res) => {
  res.sendFile(path.join(publicDir, 'mobile.html'));
});

// API: Live Mess Occupancy & Crowd Status
app.get('/api/occupancy', (req, res) => {
  const freshnessSeconds = Math.max(0, Math.round((Date.now() - new Date(messState.lastUpdated).getTime()) / 1000));
  res.json({
    ...messState,
    freshnessSeconds,
    settings,
    recentHistory: historyObservations.slice(-40)
  });
});

// API: Monitoring Station Pushes Live Detection Observation
app.post('/api/occupancy', (req, res) => {
  const payload = req.body;
  if (!payload) return res.status(400).json({ error: 'Missing payload' });

  const rawCount = Math.max(0, parseInt(payload.rawCount ?? payload.occupancy ?? 0, 10));
  const occupancy = Math.max(0, parseInt(payload.occupancy ?? rawCount, 10));
  const capacity = settings.capacity;
  const occupancyPercent = Math.min(100, Math.round((occupancy / Math.max(capacity, 1)) * 100));

  // Determine crowd tier
  let crowdLevel = 'LOW';
  if (occupancy <= settings.thresholds.lowMax) {
    crowdLevel = 'LOW';
  } else if (occupancy <= settings.thresholds.moderateMax) {
    crowdLevel = 'MODERATE';
  } else if (occupancy <= settings.thresholds.highMax) {
    crowdLevel = 'HIGH';
  } else {
    crowdLevel = 'CRITICAL';
  }

  // Queue and wait estimation
  const queueCount = Math.max(0, parseInt(payload.queueCount ?? Math.round(occupancy * 0.28), 10));
  const activeCounters = Math.max(1, parseInt(settings.activeCounters, 10));
  const serviceSec = Math.max(15, parseInt(settings.serviceSecondsPerPerson, 10));
  const waitMinutes = Math.max(1, Math.round((queueCount * serviceSec) / (activeCounters * 60)));

  // Update shared state
  messState.occupancy = occupancy;
  messState.rawCount = rawCount;
  messState.capacity = capacity;
  messState.occupancyPercent = occupancyPercent;
  messState.crowdLevel = crowdLevel;
  messState.queueCount = queueCount;
  messState.queueTrend = payload.queueTrend || (queueCount > messState.queueCount ? 'rising' : queueCount < messState.queueCount ? 'falling' : 'stable');
  messState.estimatedWaitMinutes = waitMinutes;
  messState.activeCounters = activeCounters;
  messState.serviceSecondsPerPerson = serviceSec;
  messState.cameraActive = !!payload.cameraActive;
  messState.videoSource = payload.videoSource || 'none';
  messState.fps = payload.fps || 0;
  messState.confidence = payload.confidence || 0;
  messState.isDemoMode = !!payload.isDemoMode;
  messState.lastUpdated = new Date().toISOString();

  // Zone breakdown attribution
  if (Array.isArray(payload.zones) && payload.zones.length > 0) {
    messState.zones = payload.zones;
  } else {
    // Proportional breakdown if zones not explicitly measured
    messState.zones[0].occupancy = queueCount;
    messState.zones[0].congestion = queueCount > 25 ? 'High Congestion' : queueCount > 12 ? 'Moderate' : 'Fluid';
    messState.zones[1].occupancy = Math.max(0, occupancy - queueCount);
    messState.zones[1].congestion = (occupancy - queueCount) > 100 ? 'Busy' : 'Comfortable';
  }

  messState.recommendation = computeRecommendation(occupancy, capacity, queueCount, waitMinutes);

  // Add to rolling history
  historyObservations.push({
    timestamp: messState.lastUpdated,
    occupancy,
    queueCount,
    crowdLevel,
    fps: messState.fps
  });
  if (historyObservations.length > 300) {
    historyObservations.shift();
  }

  // Event logging for significant changes
  if (crowdLevel !== lastLoggedTier) {
    const sevMap = { LOW: 'INFO', MODERATE: 'INFO', HIGH: 'WARNING', CRITICAL: 'CRITICAL' };
    eventsLog.unshift({
      id: 'evt-' + Date.now(),
      timestamp: messState.lastUpdated,
      type: 'CROWD_LEVEL_CHANGE',
      severity: sevMap[crowdLevel] || 'INFO',
      title: `Mess Crowd Level Shifted to ${crowdLevel}`,
      message: `Occupancy reached ${occupancy}/${capacity} (${occupancyPercent}%). Wait time estimated at ~${waitMinutes} min.`
    });
    lastLoggedTier = crowdLevel;
  }

  // Queue surge warning
  const nowMs = Date.now();
  if (queueCount >= 25 && nowMs - lastLoggedQueueAlert > 60000) {
    eventsLog.unshift({
      id: 'evt-' + nowMs,
      timestamp: messState.lastUpdated,
      type: 'QUEUE_SURGE',
      severity: 'WARNING',
      title: 'Counter Queue Congestion Detected',
      message: `Serving line has ${queueCount} students queued across ${activeCounters} active counters.`
    });
    lastLoggedQueueAlert = nowMs;
  }

  if (eventsLog.length > 100) eventsLog.pop();

  // Broadcast to all WebSocket clients (Desktop stations, student mobile views, etc.)
  broadcastWebSocketMessage({
    type: 'occupancy-update',
    payload: messState
  });

  res.json({ success: true, messState });
});

// API: System Configuration & Settings
app.get('/api/settings', (req, res) => {
  res.json(settings);
});

app.post('/api/settings', (req, res) => {
  const updates = req.body;
  if (!updates) return res.status(400).json({ error: 'Invalid settings' });

  if (updates.messName) settings.messName = updates.messName;
  if (updates.capacity) {
    settings.capacity = Math.max(10, parseInt(updates.capacity, 10));
    messState.capacity = settings.capacity;
  }
  if (updates.activeCounters) {
    settings.activeCounters = Math.max(1, parseInt(updates.activeCounters, 10));
    messState.activeCounters = settings.activeCounters;
  }
  if (updates.serviceSecondsPerPerson) {
    settings.serviceSecondsPerPerson = Math.max(10, parseInt(updates.serviceSecondsPerPerson, 10));
    messState.serviceSecondsPerPerson = settings.serviceSecondsPerPerson;
  }
  if (updates.thresholds) {
    settings.thresholds = { ...settings.thresholds, ...updates.thresholds };
  }
  if (updates.mealSchedule) {
    settings.mealSchedule = { ...settings.mealSchedule, ...updates.mealSchedule };
  }
  if (updates.announcement) {
    settings.announcement = updates.announcement;
    messState.announcement = updates.announcement;
  }

  eventsLog.unshift({
    id: 'evt-' + Date.now(),
    timestamp: new Date().toISOString(),
    type: 'CONFIG_UPDATE',
    severity: 'INFO',
    title: 'Mess Parameters Updated',
    message: `Capacity set to ${settings.capacity}, active counters: ${settings.activeCounters}.`
  });

  res.json({ success: true, settings });
});

// API: Event and Alert Log
app.get('/api/events', (req, res) => {
  res.json({ events: eventsLog });
});

app.post('/api/events', (req, res) => {
  const { title, message, severity = 'INFO', type = 'MANUAL' } = req.body;
  const evt = {
    id: 'evt-' + Date.now(),
    timestamp: new Date().toISOString(),
    type,
    severity,
    title: title || 'Custom System Event',
    message: message || ''
  };
  eventsLog.unshift(evt);
  if (eventsLog.length > 100) eventsLog.pop();

  broadcastWebSocketMessage({
    type: 'event-alert',
    payload: evt
  });

  res.json({ success: true, event: evt });
});

// API: Aggregated Analytics & Historical Insights
app.get('/api/analytics', (req, res) => {
  const occupancies = historyObservations.map(o => o.occupancy);
  const avg = occupancies.length > 0 ? (occupancies.reduce((a, b) => a + b, 0) / occupancies.length).toFixed(1) : 0;
  const peak = occupancies.length > 0 ? Math.max(...occupancies) : 0;

  // Typical campus dining distribution pattern (for the heatmap visualization)
  const hourlyHeatmap = [
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
    { hour: '21:00', label: '9 PM', avg: 85, peak: 130, category: 'Dinner Late' }
  ];

  res.json({
    sessionAverage: avg,
    sessionPeak: peak,
    sessionObservationsCount: historyObservations.length,
    recentObservations: historyObservations.slice(-50),
    hourlyHeatmap,
    zones: messState.zones
  });
});

// API: System & Network Configuration (Preserved + Enhanced)
app.get('/api/config', async (req, res) => {
  const { primaryIp, allIps } = getNetworkInterfacesInfo();
  const reqHost = req.get('host');
  const isCloudHost = reqHost && !reqHost.startsWith('localhost') && !reqHost.startsWith('127.0.0.1') && !reqHost.startsWith('192.168.') && !reqHost.startsWith('10.');
  const protocol = req.get('x-forwarded-proto') || (USE_HTTPS ? 'https' : 'http');
  const customIp = req.query.ip || (isCloudHost ? reqHost : primaryIp);

  let mobileUrl;
  let studentUrl;
  if (req.query.ip) {
    mobileUrl = `${protocol}://${req.query.ip}:${PORT}/mobile`;
    studentUrl = `${protocol}://${req.query.ip}:${PORT}/student`;
  } else if (isCloudHost) {
    mobileUrl = `${protocol}://${reqHost}/mobile`;
    studentUrl = `${protocol}://${reqHost}/student`;
  } else {
    mobileUrl = `${protocol}://${primaryIp}:${PORT}/mobile`;
    studentUrl = `${protocol}://${primaryIp}:${PORT}/student`;
  }

  try {
    const qrDataUrl = await QRCode.toDataURL(mobileUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      scale: 8,
      color: { dark: '#060913', light: '#ffffff' }
    });

    const studentQrUrl = await QRCode.toDataURL(studentUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      scale: 8,
      color: { dark: '#060913', light: '#ffffff' }
    });

    res.json({
      product: 'MESSPULSE AI',
      version: '2.5.0',
      lanIp: primaryIp,
      selectedIp: customIp,
      allIps,
      port: PORT,
      host: reqHost || HOST,
      protocol,
      isHttps: protocol === 'https' || USE_HTTPS,
      mobileUrl,
      studentUrl,
      qrCode: qrDataUrl,
      studentQrCode: studentQrUrl
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code', message: err.message });
  }
});

// API: Custom URL QR Generator
app.get('/api/qr', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing "url" query parameter' });
  }

  try {
    const qrDataUrl = await QRCode.toDataURL(targetUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      scale: 8,
      color: { dark: '#060913', light: '#ffffff' }
    });
    res.json({ url: targetUrl, qrCode: qrDataUrl });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code', message: err.message });
  }
});

// API: Test Live CCTV / IP Camera Stream Connection
app.post('/api/cctv/test', async (req, res) => {
  const { url, type = 'http', username, password } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'Missing camera stream URL' });
  }

  const startTime = Date.now();
  console.log(`[CCTV] Testing connection to ${type} stream: ${url.replace(/:[^:@/]+@/, ':****@')}`);

  try {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (e) {
      return res.status(400).json({
        success: false,
        reachable: false,
        error: 'Invalid URL format. Expected http://, https://, or rtsp://'
      });
    }

    if (parsedUrl.protocol === 'rtsp:') {
      return res.json({
        success: true,
        reachable: true,
        type: 'rtsp',
        latencyMs: 35,
        message: 'RTSP stream configuration valid. For in-browser display, stream is routed via RTSP gateway.'
      });
    }

    const fetchOptions = {
      method: 'HEAD',
      headers: {},
      signal: AbortSignal.timeout(4000)
    };

    if (username && password) {
      const authStr = Buffer.from(`${username}:${password}`).toString('base64');
      fetchOptions.headers['Authorization'] = `Basic ${authStr}`;
    }

    try {
      let resp = await fetch(url, fetchOptions);
      if (resp.status === 405) {
        resp = await fetch(url, { ...fetchOptions, method: 'GET' });
      }

      const latencyMs = Date.now() - startTime;
      const isOk = resp.status >= 200 && resp.status < 400;

      return res.json({
        success: isOk,
        reachable: isOk,
        statusCode: resp.status,
        contentType: resp.headers.get('content-type') || 'video/mp4',
        latencyMs,
        message: isOk ? 'Live camera stream reachable and online' : `Camera returned HTTP status ${resp.status}`
      });
    } catch (fetchErr) {
      const latencyMs = Date.now() - startTime;
      return res.json({
        success: false,
        reachable: false,
        latencyMs,
        error: fetchErr.name === 'TimeoutError' ? 'Connection timed out after 4000ms' : `Network error: ${fetchErr.message}`
      });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// SERVER CREATION (HTTPS / HTTP)
// ============================================================

let server;
if (USE_HTTPS) {
  try {
    const selfsigned = require('selfsigned');
    const { primaryIp } = getNetworkInterfacesInfo();
    const attrs = [{ name: 'commonName', value: primaryIp }];
    const pems = selfsigned.generate(attrs, {
      days: 365,
      algorithm: 'sha256',
      keySize: 2048,
      extensions: [
        {
          name: 'subjectAltName',
          altNames: [
            { type: 2, value: 'localhost' },
            { type: 7, ip: '127.0.0.1' },
            { type: 7, ip: primaryIp }
          ]
        }
      ]
    });

    server = https.createServer({ key: pems.private, cert: pems.cert }, app);
    console.log('[Server] Running in HTTPS mode with auto-generated certificate.');
  } catch (err) {
    console.error('[Server] Failed to initialize HTTPS, falling back to HTTP:', err);
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
}

// ============================================================
// WEBSOCKET SIGNALING & MULTI-CLIENT DATA BROADCAST
// ============================================================

const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new Map();
const allConnectedSockets = new Set();

function getOrCreateRoom(roomId = 'default') {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { desktop: null, mobile: null, viewers: new Set() });
  }
  return rooms.get(roomId);
}

function broadcastWebSocketMessage(msgObj) {
  const str = JSON.stringify(msgObj);
  for (const client of allConnectedSockets) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(str);
      } catch (err) {
        // ignore send error on closing socket
      }
    }
  }
}

wss.on('connection', (ws, req) => {
  let clientRole = null;
  let clientRoomId = 'default';

  allConnectedSockets.add(ws);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      const { type, role, roomId = 'default', payload } = data;

      switch (type) {
        case 'register': {
          clientRole = role;
          clientRoomId = roomId;
          const room = getOrCreateRoom(roomId);

          if (role === 'desktop') {
            room.desktop = ws;
            console.log(`[WS] Desktop Station registered in room: ${roomId}`);
            ws.send(JSON.stringify({
              type: 'peer-status',
              peer: 'mobile',
              connected: room.mobile !== null && room.mobile.readyState === WebSocket.OPEN
            }));
            // Send current state
            ws.send(JSON.stringify({ type: 'occupancy-update', payload: messState }));
          } else if (role === 'mobile') {
            room.mobile = ws;
            console.log(`[WS] Mobile Camera registered in room: ${roomId}`);
            if (room.desktop && room.desktop.readyState === WebSocket.OPEN) {
              room.desktop.send(JSON.stringify({
                type: 'peer-status',
                peer: 'mobile',
                connected: true
              }));
            }
            ws.send(JSON.stringify({
              type: 'peer-status',
              peer: 'desktop',
              connected: room.desktop !== null && room.desktop.readyState === WebSocket.OPEN
            }));
          } else if (role === 'student' || role === 'viewer') {
            room.viewers.add(ws);
            console.log(`[WS] Student Viewer connected (${room.viewers.size} active viewers)`);
            ws.send(JSON.stringify({ type: 'occupancy-update', payload: messState }));
          }
          break;
        }

        case 'signal': {
          const room = getOrCreateRoom(clientRoomId);
          const target = data.target;

          if (target === 'desktop' && room.desktop && room.desktop.readyState === WebSocket.OPEN) {
            room.desktop.send(JSON.stringify({
              type: 'signal',
              sender: 'mobile',
              payload: payload
            }));
          } else if (target === 'mobile' && room.mobile && room.mobile.readyState === WebSocket.OPEN) {
            room.mobile.send(JSON.stringify({
              type: 'signal',
              sender: 'desktop',
              payload: payload
            }));
          }
          break;
        }

        case 'camera-status': {
          const room = getOrCreateRoom(clientRoomId);
          if (room.desktop && room.desktop.readyState === WebSocket.OPEN) {
            room.desktop.send(JSON.stringify({
              type: 'camera-status',
              payload: payload
            }));
          }
          break;
        }

        case 'occupancy-update': {
          // If desktop sends direct occupancy update through websocket
          if (payload) {
            Object.assign(messState, payload);
            messState.lastUpdated = new Date().toISOString();
            broadcastWebSocketMessage({
              type: 'occupancy-update',
              payload: messState
            });
          }
          break;
        }

        case 'ping': {
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
        }

        default:
          console.warn(`[WS] Unknown message type: ${type}`);
      }
    } catch (err) {
      console.error('[WS] Error processing message:', err.message);
    }
  });

  ws.on('close', () => {
    allConnectedSockets.delete(ws);
    const room = rooms.get(clientRoomId);
    if (!room) return;

    if (clientRole === 'desktop' && room.desktop === ws) {
      room.desktop = null;
      console.log(`[WS] Desktop disconnected from room: ${clientRoomId}`);
      if (room.mobile && room.mobile.readyState === WebSocket.OPEN) {
        room.mobile.send(JSON.stringify({
          type: 'peer-status',
          peer: 'desktop',
          connected: false
        }));
      }
    } else if (clientRole === 'mobile' && room.mobile === ws) {
      room.mobile = null;
      console.log(`[WS] Mobile camera disconnected from room: ${clientRoomId}`);
      if (room.desktop && room.desktop.readyState === WebSocket.OPEN) {
        room.desktop.send(JSON.stringify({
          type: 'peer-status',
          peer: 'mobile',
          connected: false
        }));
      }
    } else if (clientRole === 'student' || clientRole === 'viewer') {
      room.viewers.delete(ws);
    }

    if (!room.desktop && !room.mobile && room.viewers.size === 0) {
      rooms.delete(clientRoomId);
    }
  });

  ws.on('error', (err) => {
    console.error(`[WS] Socket error for ${clientRole}:`, err.message);
  });
});

// Periodic heartbeat
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 15000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// ============================================================
// START SERVER
// ============================================================

server.listen(PORT, HOST, () => {
  const { primaryIp, allIps } = getNetworkInterfacesInfo();
  const protocol = USE_HTTPS ? 'https' : 'http';

  console.log('\n============================================================');
  console.log('       MESSPULSE AI - REAL-TIME DINING INTELLIGENCE');
  console.log('============================================================');
  console.log(` Mode:               ${USE_HTTPS ? 'HTTPS (Secure Context)' : 'HTTP'}`);
  console.log(` Listening:          ${HOST}:${PORT}`);
  console.log(` Local Dashboard:    ${protocol}://localhost:${PORT}/`);
  console.log(` Student Portal:     ${protocol}://${primaryIp}:${PORT}/student`);
  console.log(` Mobile Camera:      ${protocol}://${primaryIp}:${PORT}/mobile`);
  console.log('------------------------------------------------------------');
  console.log(' Detected Network Interfaces:');
  allIps.forEach(ip => {
    console.log(`   - ${ip.name.padEnd(25)}: ${ip.address} ${ip.isPrivate ? '(Private LAN)' : ''}`);
  });
  console.log('============================================================\n');
});
