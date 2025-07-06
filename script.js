const { collection, doc, getDoc, getDocs, setDoc, addDoc, query, where, orderBy, updateDoc } = window.firestore;

let currentUser = JSON.parse(localStorage.getItem('twister2User') || "null");
let currentProfileView = null; // whose profile are we viewing?

(async function initUser() {
  if (!currentUser) {
    let u = prompt("Pick a @ username:").replace(/\W/g,'').slice(0,18);
    if (!u) u = "user" + Math.floor(Math.random()*9999);
    let n = prompt("Pick a name:").slice(0,20) || u;
    currentUser = {username: u, display: n, bio: "", followers: [], following: [], groups: []};
    localStorage.setItem('twister2User', JSON.stringify(currentUser));
    await setDoc(doc(db, "users", u), {...currentUser}, {merge:true});
  }
  setupNav();
  loadFeed();
  loadExplore();
  renderChats();
  // Default to your own profile
  currentProfileView = currentUser.username;
  renderProfile(currentProfileView);
})();

function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn=>{
    btn.onclick=()=>{
      if (btn.dataset.page === "profile") {
        currentProfileView = currentUser.username;
        renderProfile(currentUser.username);
      }
      switchPage(btn.dataset.page);
    };
  });
}
function switchPage(page) {
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector(`.nav-btn[data-page="${page}"]`).classList.add('active');
  document.getElementById('feedPage').style.display = page==="feed"?"block":"none";
  document.getElementById('explorePage').style.display = page==="explore"?"block":"none";
  document.getElementById('messagesPage').style.display = page==="messages"?"block":"none";
  document.getElementById('profilePanel').style.display = page==="profile"?"block":"none";
  if (page==="feed") loadFeed();
  if (page==="explore") loadExplore();
  if (page==="messages") renderChats();
  if (page==="profile") renderProfile(currentProfileView);
}

document.getElementById('postBtn').onclick = async () => {
  const text = document.getElementById('postText').value.trim();
  if (!text) return;
  await addDoc(collection(db, "posts"), {
    user: currentUser.username,
    display: currentUser.display,
    content: text,
    likes: [],
    comments: [],
    created_at: new Date()
  });
  document.getElementById('postText').value = "";
  loadFeed();
  loadExplore();
  renderProfile(currentProfileView);
};

// FEED
async function loadFeed() {
  const q = query(collection(db,"posts"), orderBy("created_at","desc"));
  const snap = await getDocs(q);
  let posts = [];
  snap.forEach(docSnap => posts.push({...docSnap.data(), id:docSnap.id}));
  // Feed algo: blend by recency + likes + following
  posts.forEach(p=>p.rank = 1000000000 - new Date(p.created_at).getTime() + 8000*(p.likes?.length||0) + 12000*(p.comments?.length||0) + (currentUser.following||[]).includes(p.user)?7000:0);
  posts.sort((a,b)=>a.rank-b.rank);
  const feed = document.getElementById('feedList');
  feed.innerHTML = '';
  posts.slice(0,30).forEach(post => feed.appendChild(createPostCard(post)));
}
// EXPLORE
async function loadExplore() {
  const q = query(collection(db,"posts"), orderBy("created_at","desc"));
  const snap = await getDocs(q);
  let posts = [];
  snap.forEach(docSnap => posts.push({...docSnap.data(), id:docSnap.id}));
  posts.sort((a,b)=>((b.likes?.length||0)+(b.comments?.length||0))-((a.likes?.length||0)+(a.comments?.length||0)));
  const exploreFeed = document.getElementById('exploreList');
  exploreFeed.innerHTML = '';
  posts.slice(0,20).forEach(post => exploreFeed.appendChild(createPostCard(post)));
}
function createPostCard(post) {
  const div = document.createElement('div');
  div.className = 'post-card';
  const liked = post.likes?.includes(currentUser.username);
  div.innerHTML = `
    <span class="user" data-user="${post.user}">@${post.display||post.user}</span>
    <div class="post-content">${post.content||""}</div>
    <div class="post-footer">
      <button class="like-btn${liked?' liked':''}" title="Like">&#x2764;<span class="likes">${post.likes?.length||0}</span></button>
      <button class="comments-btn" title="Comments">💬 <span class="comments-count">${post.comments?.length||0}</span></button>
      <span style="color:#83faac;font-size:0.97em;margin-left:auto;">${post.created_at?new Date(post.created_at).toLocaleTimeString():''}</span>
    </div>
    <div class="comment-list" style="display:none"></div>
    <div class="comment-input-row" style="display:none">
      <input class="comment-input" maxlength="150" placeholder="Add a comment...">
      <button class="comment-send-btn">Send</button>
    </div>
  `;
  div.querySelector('.user').onclick = ()=>{
    currentProfileView = post.user;
    renderProfile(post.user);
    switchPage("profile");
  };
  // Like logic
  div.querySelector('.like-btn').onclick = async ()=>{
    const docRef = doc(db,"posts",post.id);
    let newLikes = post.likes?([...post.likes]):[];
    if (liked) newLikes = newLikes.filter(u=>u!==currentUser.username);
    else newLikes.push(currentUser.username);
    await updateDoc(docRef,{likes:newLikes});
    loadFeed(); loadExplore(); renderProfile(currentProfileView);
  };
  // Comments
  const clist = div.querySelector('.comment-list');
  const crow = div.querySelector('.comment-input-row');
  div.querySelector('.comments-btn').onclick=()=>{
    clist.style.display = clist.style.display==='block'?'none':'block';
    crow.style.display = crow.style.display==='flex'?'none':'flex';
    renderComments(post, clist);
  };
  div.querySelector('.comment-send-btn').onclick = async ()=>{
    const input = div.querySelector('.comment-input');
    const val = input.value.trim();
    if (!val) return;
    const docRef = doc(db,"posts",post.id);
    const snap = await getDoc(docRef);
    const prevComments = (snap.data().comments)||[];
    const comment = {user: currentUser.username, text: val, time: Date.now()};
    prevComments.push(comment);
    await updateDoc(docRef, {comments: prevComments});
    input.value = '';
    renderComments(post, clist);
    loadFeed(); loadExplore(); renderProfile(currentProfileView);
  };
  return div;
}
function renderComments(post, el) {
  el.innerHTML = '';
  const comments = post.comments||[];
  if (!comments.length) return el.innerHTML = '<div style="color:#888">No comments yet.</div>';
  comments.forEach(com=>{
    el.innerHTML += `
      <div class="comment">
        <span class="user" style="cursor:pointer">@${com.user}</span>
        <span>${com.text}</span>
        <span style="font-size:0.92em;color:#b8e6e7;margin-left:5px;">${com.time?new Date(com.time).toLocaleTimeString():""}</span>
      </div>
    `;
  });
  el.querySelectorAll('.user').forEach(uEl=>{
    uEl.onclick=()=>{
      currentProfileView = uEl.innerText.replace("@","");
      renderProfile(currentProfileView);
      switchPage("profile");
    };
  });
}
async function renderProfile(username) {
  // Remove any old chat section
  const chatSectionOld = document.getElementById('profileExtra');
  chatSectionOld.innerHTML = '';
  let userDoc = await getDoc(doc(db,"users",username));
  let userData = userDoc.exists()?userDoc.data():{username,display:username,bio:"",followers:[],following:[]};
  userData.username = username;
  const isSelf = (username===currentUser.username);
  const c = document.getElementById('profileContent');
  c.innerHTML = `
    <div class="profile-name">${userData.display}</div>
    <div class="profile-user">@${userData.username}</div>
    <div class="profile-bio">${userData.bio||""}</div>
    <div class="profile-follows">
      <span>${userData.followers?.length||0} Followers</span>
      <span>${userData.following?.length||0} Following</span>
    </div>
    ${isSelf?
    `<div class="profile-edit-row">
      <input id="editDisplayName" value="${userData.display}" maxlength="20"/>
      <textarea id="editBio" rows="2" maxlength="90">${userData.bio||""}</textarea>
      <button class="profile-save-btn" id="saveProfileBtn">Save Profile</button>
    </div>`
    :`<button class="follow-btn${(userData.followers||[]).includes(currentUser.username)?" following":""}" id="followBtn">${(userData.followers||[]).includes(currentUser.username)?"Unfollow":"Follow"}</button>
    <button class="profile-save-btn" id="msgBtn">Message</button>`
    }
  `;
  document.getElementById('profilePostsTitle').innerText =
    isSelf
    ? 'Your Posts'
    : `${userData.display}'s Posts and ${userData.display}'s Stuff`;
  if (isSelf) {
    c.querySelector('#saveProfileBtn').onclick = async()=>{
      userData.display = c.querySelector('#editDisplayName').value.slice(0,20) || "Anonymous";
      userData.bio = c.querySelector('#editBio').value.slice(0,90) || "";
      currentUser.display = userData.display;
      currentUser.bio = userData.bio;
      localStorage.setItem('twister2User', JSON.stringify(currentUser));
      await setDoc(doc(db,"users",userData.username), userData, {merge:true});
      renderProfile(userData.username);
    };
    renderMyChatsAndGroups();
  } else {
    c.querySelector('#followBtn').onclick = async ()=>{
      let isF = (userData.followers||[]).includes(currentUser.username);
      if (!isF) userData.followers = [...(userData.followers||[]),currentUser.username];
      else userData.followers = userData.followers.filter(u=>u!==currentUser.username);
      await setDoc(doc(db,"users",userData.username), userData, {merge:true});
      renderProfile(userData.username);
    };
    c.querySelector('#msgBtn').onclick = ()=>{
      openChat(username, false);
      switchPage("messages");
    };
  }
  const snap = await getDocs(query(collection(db,"posts"),where("user","==",username),orderBy("created_at","desc")));
  const list = document.getElementById('profilePosts');
  list.innerHTML = '';
  snap.forEach(docSnap=>list.appendChild(createPostCard({...docSnap.data(),id:docSnap.id})));
}

async function renderMyChatsAndGroups() {
  const chatSection = document.getElementById('profileExtra');
  // DMs
  chatSection.innerHTML = `<h4 style="color:#00e0c5;margin-top:18px;margin-bottom:8px">Your Chats</h4>`;
  const q = query(collection(db,"messages"), where("participants","array-contains",currentUser.username));
  const snap = await getDocs(q);
  const chats = {};
  snap.forEach(docSnap=>{
    const m = docSnap.data();
    if (!m.group) {
      const other = m.from===currentUser.username ? m.to : m.from;
      if (!chats[other]) chats[other]=[];
      chats[other].push(m);
    }
  });
  Object.keys(chats).forEach(other=>{
    let lastMsg = chats[other][chats[other].length-1];
    const row = document.createElement('div');
    row.className = 'chat-item';
    row.innerHTML = `<span>@${other}</span> <span style="font-size:.96em;color:#1da1f2">${lastMsg.text.slice(0,24)}</span>`;
    row.onclick=()=>openChat(other,false);
    chatSection.appendChild(row);
  });
  // Groups
  chatSection.innerHTML += `<h4 style="color:#00e0c5;margin-top:18px;margin-bottom:8px">Your Groups</h4>`;
  const gsnap = await getDocs(collection(db,"groups"));
  gsnap.forEach(docSnap=>{
    const g = docSnap.data();
    if ((g.members||[]).includes(currentUser.username)) {
      const row = document.createElement('div');
      row.className = 'chat-item';
      row.innerHTML = `<span>${g.name}</span><span style="font-size:.93em;color:#1da1f2">${(g.last||"").slice(0,22)}</span>`;
      row.onclick=()=>openChat(docSnap.id,true);
      chatSection.appendChild(row);
    }
  });
}
// --- Chat logic and modal remain unchanged from earlier
document.getElementById('createGroupBtn').onclick = ()=>{
  document.getElementById('groupModal').style.display = "block";
};
document.getElementById('groupModalCancelBtn').onclick = ()=>{
  document.getElementById('groupModal').style.display = "none";
};
document.getElementById('groupModalCreateBtn').onclick = async ()=>{
  const name = document.getElementById('groupNameInput').value.trim();
  const users = document.getElementById('groupUsersInput').value.trim().split(",").map(x=>x.trim()).filter(x=>x);
  if (!name || users.length<1) return alert("Fill all fields.");
  users.push(currentUser.username);
  const docRef = await addDoc(collection(db,"groups"),{name, members:users, last:""});
  document.getElementById('groupModal').style.display = "none";
  openChat(docRef.id,true);
  switchPage("messages");
  document.getElementById('groupNameInput').value="";
  document.getElementById('groupUsersInput').value="";
};

async function renderChats() {
  const chatList = document.getElementById('chatList');
  chatList.innerHTML = "<b>Direct Messages</b>";
  const q = query(collection(db,"messages"), where("participants","array-contains",currentUser.username));
  const snap = await getDocs(q);
  const chats = {};
  snap.forEach(docSnap=>{
    const m = docSnap.data();
    if (!m.group) {
      const other = m.from===currentUser.username ? m.to : m.from;
      if (!chats[other]) chats[other]=[];
      chats[other].push(m);
    }
  });
  Object.keys(chats).forEach(other=>{
    let lastMsg = chats[other][chats[other].length-1];
    const row = document.createElement('div');
    row.className = 'chat-item';
    row.innerHTML = `<span>@${other}</span> <span style="font-size:.96em;color:#1da1f2">${lastMsg.text.slice(0,24)}</span>`;
    row.onclick=()=>openChat(other,false);
    chatList.appendChild(row);
  });
  // Groups
  const groupList = document.getElementById('groupList');
  groupList.innerHTML = "<b>Groups</b>";
  const gsnap = await getDocs(collection(db,"groups"));
  gsnap.forEach(docSnap=>{
    const g = docSnap.data();
    if ((g.members||[]).includes(currentUser.username)) {
      const row = document.createElement('div');
      row.className = 'chat-item';
      row.innerHTML = `<span>${g.name}</span><span style="font-size:.93em;color:#1da1f2">${(g.last||"").slice(0,22)}</span>`;
      row.onclick=()=>openChat(docSnap.id,true);
      groupList.appendChild(row);
    }
  });
  document.getElementById('chatMain').style.display = "none";
}
async function openChat(who, isGroup) {
  document.getElementById('chatMain').style.display = "flex";
  let chatName = isGroup ? (await getDoc(doc(db,"groups",who))).data().name : `@${who}`;
  document.getElementById('chatHeader').innerHTML = `<b>${chatName}</b>`;
  const thread = document.getElementById('chatThread');
  thread.innerHTML = '';
  let msgs = [];
  if (isGroup) {
    const snap = await getDocs(query(collection(db,"messages"),where("group","==",who),orderBy("time")));
    snap.forEach(docSnap=>msgs.push(docSnap.data()));
  } else {
    const snap = await getDocs(query(collection(db,"messages"),where("participants","array-contains",currentUser.username),orderBy("time")));
    snap.forEach(docSnap=>{
      let m = docSnap.data();
      if ((m.from===currentUser.username && m.to===who)||(m.from===who && m.to===currentUser.username)) msgs.push(m);
    });
  }
  msgs.sort((a,b)=>(a.time||0)-(b.time||0));
  msgs.forEach(msg=>{
    const row = document.createElement('div');
    row.className = msg.from===currentUser.username?'bubble-row bubble-me':'bubble-row bubble-you';
    row.innerHTML = `
      <div class="bubble${msg.from===currentUser.username?' mine':''}">
        ${isGroup?`<span class="chat-user">${msg.from}</span>`:""}
        ${msg.text}
      </div>
    `;
    thread.appendChild(row);
  });
  thread.scrollTop = thread.scrollHeight;
  document.getElementById('chatSendBtn').onclick = async ()=>{
    const val = document.getElementById('chatInput').value.trim();
    if (!val) return;
    if (isGroup) {
      await addDoc(collection(db,"messages"),{
        from: currentUser.username, group: who,
        text: val, time: Date.now()
      });
      await updateDoc(doc(db,"groups",who),{last: val});
    } else {
      await addDoc(collection(db,"messages"),{
        from: currentUser.username, to: who,
        participants: [currentUser.username, who],
        text: val, time: Date.now()
      });
    }
    document.getElementById('chatInput').value = "";
    openChat(who, isGroup);
  };
  document.getElementById('closeChatBtn').onclick = ()=>{
    document.getElementById('chatMain').style.display = "none";
    renderChats();
  }
}
