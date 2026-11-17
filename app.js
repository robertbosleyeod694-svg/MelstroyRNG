
const supabaseClient = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_PUBLISHABLE_KEY
);

const memes = [
  { id: "handsome", name: "красавчик", price: 235000, icon: "😎" },
  { id: "sadness", name: "грусть", price: 850, icon: "😔" },
  { id: "interesting", name: "интересно", price: 35000, icon: "🤔" }
];

let currentUser = null;
let currentProfile = null;
let inventory = [];
let spinning = false;
let muted = false;
let volume = 50;
let previewIndex = 0;

const $ = (id) => document.getElementById(id);

function formatPrice(value) {
  return Number(value || 0).toLocaleString("ru-RU") + " ₽";
}

function showStatus(id, message, error = false) {
  const element = $(id);
  if (!element) return;
  element.textContent = message;
  element.style.color = error ? "#ff7777" : "#54ff83";
}

function showGame() {
  $("auth-screen").classList.add("hidden");
  $("game-screen").classList.remove("hidden");
}

function showAuth() {
  $("game-screen").classList.add("hidden");
  $("auth-screen").classList.remove("hidden");
}

async function guestLogin() {
  const button = $("guest-button");
  button.disabled = true;
  button.textContent = "СОЗДАЁМ АККАУНТ...";

  showStatus("auth-status", "Подключаемся к серверу...");

  try {
    let { data: sessionData, error: sessionError } =
      await supabaseClient.auth.getSession();

    if (sessionError) throw sessionError;

    if (sessionData.session) {
      currentUser = sessionData.session.user;
    } else {
      const { data, error } =
        await supabaseClient.auth.signInAnonymously();

      if (error) throw error;
      currentUser = data.user;
    }

    const { data: profile, error: profileError } =
      await supabaseClient.rpc("create_guest_profile");

    if (profileError) throw profileError;

    currentProfile = profile;

    showGame();
    await refreshAll();

    startPreview();

  } catch (error) {
    console.error("Guest login error:", error);
    showStatus(
      "auth-status",
      "Ошибка: " + (error.message || "Не удалось войти"),
      true
    );
  } finally {
    button.disabled = false;
    button.textContent = "ВОЙТИ КАК ГОСТЬ";
  }
}

async function refreshProfile() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id,nickname,total_value")
    .eq("id", currentUser.id)
    .single();

  if (error) throw error;

  currentProfile = data;

  $("player-name").textContent = data.nickname;
  $("profile-name").textContent = data.nickname;

  $("player-value").textContent = formatPrice(data.total_value);
  $("profile-value").textContent = formatPrice(data.total_value);
}

async function refreshInventory() {
  const { data, error } = await supabaseClient
    .from("inventory")
    .select("id,meme_id,meme_name,price,obtained_at")
    .eq("player_id", currentUser.id)
    .order("obtained_at", { ascending: false });

  if (error) throw error;

  inventory = data || [];

  $("inventory-count").textContent =
    inventory.length + " ПРЕДМЕТОВ";

  $("profile-count").textContent = inventory.length;

  renderInventory();
}

function renderInventory() {
  const container = $("inventory-grid");
  container.innerHTML = "";

  if (!inventory.length) {
    container.innerHTML =
      '<p style="color:#819187">Инвентарь пока пуст. Попробуй прокрутить рулетку!</p>';
    return;
  }

  inventory.forEach((item) => {
    const meme = memes.find(m => m.id === item.meme_id);
    const icon = meme ? meme.icon : "🎁";

    const card = document.createElement("article");
    card.className = "inventory-item";

    const emoji = document.createElement("div");
    emoji.className = "preview-icon";
    emoji.textContent = icon;

    const title = document.createElement("h3");
    title.textContent = item.meme_name;

    const price = document.createElement("b");
    price.textContent = formatPrice(item.price);

    const date = document.createElement("p");
    date.style.color = "#819187";
    date.style.fontSize = "11px";
    date.style.marginTop = "12px";
    date.textContent = new Date(item.obtained_at).toLocaleDateString("ru-RU");

    card.append(emoji, title, price, date);
    container.appendChild(card);
  });
}

async function refreshLeaderboard() {
  const body = $("leaderboard-body");
  body.innerHTML =
    '<tr><td colspan="3">Загружаем игроков...</td></tr>';

  const { data, error } =
    await supabaseClient.rpc("get_leaderboard");

  if (error) {
    console.error("Leaderboard error:", error);
    body.innerHTML =
      '<tr><td colspan="3">Не удалось загрузить рейтинг</td></tr>';
    return;
  }

  body.innerHTML = "";

  if (!data || !data.length) {
    body.innerHTML =
      '<tr><td colspan="3">Пока нет игроков</td></tr>';
    return;
  }

  data.forEach((player, index) => {
    const tr = document.createElement("tr");

    const place = document.createElement("td");
    place.textContent = index + 1;

    const nickname = document.createElement("td");
    nickname.textContent = player.nickname;

    const value = document.createElement("td");
    value.textContent = formatPrice(player.total_value);

    if (index < 3) {
      place.style.color = "#54ff83";
      place.style.fontWeight = "900";
    }

    tr.append(place, nickname, value);
    body.appendChild(tr);
  });
}

async function refreshAll() {
  try {
    await refreshProfile();
    await refreshInventory();
    await refreshLeaderboard();
  } catch (error) {
    console.error("Refresh error:", error);
    showStatus("spin-status", "Ошибка загрузки данных", true);
  }
}

function showPage(page) {
  document.querySelectorAll(".page").forEach(section => {
    section.classList.add("hidden");
  });

  const selected = $("page-" + page);
  if (selected) selected.classList.remove("hidden");

  document.querySelectorAll(".nav-button").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === page
    );
  });

  if (page === "leaderboard") {
    refreshLeaderboard();
  }

  if (page === "inventory") {
    refreshInventory();
  }
}

function updatePreview() {
  const meme = memes[previewIndex];

  $("center-icon").textContent = meme.icon;
  $("center-name").textContent = meme.name;
  $("center-price").textContent = formatPrice(meme.price);

  const left = memes[(previewIndex + memes.length - 1) % memes.length];
  const right = memes[(previewIndex + 1) % memes.length];

  $("side-left").querySelector(".meme-icon").textContent = left.icon;
  $("side-left").querySelector("h3").textContent = left.name;

  $("side-right").querySelector(".meme-icon").textContent = right.icon;
  $("side-right").querySelector("h3").textContent = right.name;
}

function startPreview() {
  updatePreview();

  setInterval(() => {
    if (!spinning) {
      previewIndex = (previewIndex + 1) % memes.length;
      updatePreview();
    }
  }, 3500);
}

function animatePrize(meme) {
  const source = $("center-card");
  const target = document.querySelector('[data-page="inventory"]');

  if (!source || !target) return;

  const start = source.getBoundingClientRect();
  const end = target.getBoundingClientRect();

  const clone = document.createElement("div");

  clone.textContent = meme.icon;
  clone.style.position = "fixed";
  clone.style.left = start.left + "px";
  clone.style.top = start.top + "px";
  clone.style.width = start.width + "px";
  clone.style.height = start.height + "px";
  clone.style.display = "grid";
  clone.style.placeItems = "center";
  clone.style.fontSize = "65px";
  clone.style.background = "#14251a";
  clone.style.border = "1px solid #54ff83";
  clone.style.borderRadius = "20px";
  clone.style.zIndex = "9999";
  clone.style.pointerEvents = "none";
  clone.style.transition = "all 850ms cubic-bezier(.2,.8,.2,1)";

  document.body.appendChild(clone);

  requestAnimationFrame(() => {
    clone.style.left = end.left + "px";
    clone.style.top = end.top + "px";
    clone.style.width = "35px";
    clone.style.height = "35px";
    clone.style.fontSize = "20px";
    clone.style.opacity = "0.2";
    clone.style.transform = "rotate(360deg)";
  });

  setTimeout(() => clone.remove(), 950);
}

async function spin() {
  if (spinning) return;

  spinning = true;

  const button = $("spin-button");
  button.disabled = true;
  button.querySelector("span").textContent = "КРУТИМ...";

  showStatus("spin-status", "Удача решает твою судьбу...");

  const center = $("center-card");
  center.style.transform = "scale(1.08)";
  center.style.boxShadow = "0 0 55px rgba(84,255,131,.4)";

  let animationStep = 0;

  const animation = setInterval(() => {
    const meme = memes[animationStep % memes.length];

    $("center-icon").textContent = meme.icon;
    $("center-name").textContent = meme.name;
    $("center-price").textContent = formatPrice(meme.price);

    animationStep++;
  }, 110);

  try {
    const { data, error } =
      await supabaseClient.rpc("spin_meme");

    if (error) throw error;

    clearInterval(animation);

    const won = memes.find(m => m.id === data.meme_id);

    if (won) {
      $("center-icon").textContent = won.icon;
      $("center-name").textContent = won.name;
      $("center-price").textContent = formatPrice(won.price);
    }

    showStatus(
      "spin-status",
      "Выпало: " + data.name + " — " + formatPrice(data.price)
    );

    if (won) animatePrize(won);

    await refreshProfile();
    await refreshInventory();

  } catch (error) {
    clearInterval(animation);
    console.error("Spin error:", error);

    showStatus(
      "spin-status",
      "Ошибка прокрутки: " + error.message,
      true
    );
  } finally {
    setTimeout(() => {
      spinning = false;
      button.disabled = false;
      button.querySelector("span").textContent = "КРУТИ МЕЛЛСТРОЯ!";
      center.style.transform = "";
      center.style.boxShadow = "";
    }, 1000);
  }
}

function setupSound() {
  const slider = $("volume-slider");
  const value = $("volume-value");
  const muteButton = $("mute-button");

  slider.addEventListener("input", () => {
    volume = Number(slider.value);
    value.textContent = volume + "%";

    if (volume > 0) {
      muted = false;
      muteButton.textContent = "Выключить звук";
    } else {
      muted = true;
      muteButton.textContent = "Включить звук";
    }
  });

  muteButton.addEventListener("click", () => {
    muted = !muted;

    muteButton.textContent = muted
      ? "Включить звук"
      : "Выключить звук";

    if (muted) {
      value.textContent = "0%";
    } else {
      value.textContent = volume + "%";
    }
  });
}

function setupNavigation() {
  document.querySelectorAll(".nav-button").forEach(button => {
    button.addEventListener("click", () => {
      showPage(button.dataset.page);
    });
  });
}

function setupEvents() {
  $("guest-button").addEventListener("click", guestLogin);
  $("spin-button").addEventListener("click", spin);

  setupNavigation();
  setupSound();
}

document.addEventListener("DOMContentLoaded", () => {
  setupEvents();

  supabaseClient.auth.getSession().then(async ({ data, error }) => {
    if (error) {
      console.error(error);
      return;
    }

    if (data.session) {
      currentUser = data.session.user;

      try {
        const { data: profile, error: profileError } =
          await supabaseClient.rpc("create_guest_profile");

        if (profileError) throw profileError;

        currentProfile = profile;
        showGame();
        await refreshAll();
        startPreview();

      } catch (err) {
        console.error(err);
        showAuth();
        showStatus("auth-status", err.message, true);
      }
    }
  });
});
                               
