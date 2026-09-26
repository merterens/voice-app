const socket = io();

let localStream = null;
let myName = '';
let myRoom = '';
const peers = {}; // socketId -> RTCPeerConnection
const userVolumes = {}; // socketId -> 0-2 arası ses seviyesi (1 = normal)

const config = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    // Open Relay Project'in ücretsiz TURN sunucusu (test/küçük ölçek için yeterli)
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

const joinScreen = document.getElementById('join-screen');
const roomScreen = document.getElementById('room-screen');
const statusEl = document.getElementById('status');
const userList = document.getElementById('user-list');
const audioContainer = document.getElementById('audio-container');
const roomTitle = document.getElementById('room-title');
const muteBtn = document.getElementById('mute-btn');

document.getElementById('join-btn').addEventListener('click', joinRoom);
document.getElementById('leave-btn').addEventListener('click', () => location.reload());
muteBtn.addEventListener('click', toggleMute);

async function joinRoom() {
  myName = document.getElementById('name-input').value.trim() || 'Anonim';
  myRoom = document.getElementById('room-input').value.trim();

  if (!myRoom) {
    statusEl.textContent = 'Lütfen bir oda adı gir.';
    return;
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    statusEl.textContent = 'Mikrofona erişilemedi: ' + err.message;
    return;
  }

  joinScreen.classList.add('hidden');
  roomScreen.classList.remove('hidden');
  roomTitle.textContent = `Oda: ${myRoom}`;
  addUserToList(socket.id, myName + ' (sen)', true);

  socket.emit('join-room', { room: myRoom, name: myName });
}

// Odaya girince mevcut kullanıcıların listesi gelir; onlara biz teklif (offer) göndeririz
socket.on('existing-users', (users) => {
  users.forEach((user) => {
    addUserToList(user.id, user.name);
    createPeerConnection(user.id, true);
  });
});

// Yeni biri katıldığında sadece listeye ekle, offer'ı onlar gönderecek
socket.on('user-joined', (user) => {
  addUserToList(user.id, user.name);
});

socket.on('offer', async ({ from, offer }) => {
  const pc = createPeerConnection(from, false);
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('answer', { to: from, answer });
});

socket.on('answer', async ({ from, answer }) => {
  const pc = peers[from];
  if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('ice-candidate', async ({ from, candidate }) => {
  const pc = peers[from];
  if (pc && candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('ICE candidate eklenemedi', e);
    }
  }
});

socket.on('user-left', ({ id }) => {
  if (peers[id]) {
    peers[id].close();
    delete peers[id];
  }
  const audioEl = document.getElementById('audio-' + id);
  if (audioEl) audioEl.remove();
  const li = document.getElementById('user-' + id);
  if (li) li.remove();
});

function createPeerConnection(id, isInitiator) {
  if (peers[id]) return peers[id];

  const pc = new RTCPeerConnection(config);
  peers[id] = pc;

  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', { to: id, candidate: event.candidate });
    }
  };

  pc.ontrack = (event) => {
    let audioEl = document.getElementById('audio-' + id);
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = 'audio-' + id;
      audioEl.autoplay = true;
      audioContainer.appendChild(audioEl);
    }
    audioEl.srcObject = event.streams[0];
    audioEl.volume = userVolumes[id] !== undefined ? userVolumes[id] : 1;
  };

  if (isInitiator) {
    pc.createOffer().then((offer) => {
      pc.setLocalDescription(offer);
      socket.emit('offer', { to: id, offer });
    });
  }

  return pc;
}

function addUserToList(id, name, isSelf = false) {
  if (document.getElementById('user-' + id)) return;
  const li = document.createElement('li');
  li.id = 'user-' + id;

  const nameSpan = document.createElement('span');
  nameSpan.textContent = name;
  li.appendChild(nameSpan);

  if (!isSelf) {
    userVolumes[id] = 1;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '2';
    slider.step = '0.05';
    slider.value = '1';
    slider.className = 'volume-slider';
    slider.title = 'Bu kişinin sesini ayarla';

    slider.addEventListener('input', (e) => {
      const vol = parseFloat(e.target.value);
      userVolumes[id] = vol;
      const audioEl = document.getElementById('audio-' + id);
      if (audioEl) audioEl.volume = vol;
    });

    li.appendChild(slider);
  }

  userList.appendChild(li);
}

function toggleMute() {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
  muteBtn.textContent = track.enabled ? '🔇 Sessize Al' : '🔊 Sesi Aç';
}
