/* =========================================================
   LAYEMITURBAN — storefront logic
   Vanilla JS · localStorage persistence · simulated checkout
   ========================================================= */
(() => {
  'use strict';

  const PRODUCTS = window.LT_PRODUCTS || [];
  const byId = (id) => PRODUCTS.find((p) => p.id === id);
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const money = (n) => '₦' + Number(n || 0).toLocaleString('en-NG');
  const escapeHTML = (str = '') =>
    String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const STORAGE = {
    cart: 'lt_cart_v1',
    wishlist: 'lt_wishlist_v1',
    users: 'lt_users_v1',
    session: 'lt_session_v1',
    promo: 'lt_promo_v1'
  };

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (err) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (err) {
        /* storage unavailable — app still works in-memory */
      }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (err) { /* noop */ }
    }
  };

  const state = {
    cart: store.get(STORAGE.cart, []),
    wishlist: store.get(STORAGE.wishlist, []),
    users: store.get(STORAGE.users, {}),
    sessionEmail: store.get(STORAGE.session, null),
    promo: store.get(STORAGE.promo, null),
    filter: 'all',
    search: '',
    sort: 'featured',
    authTab: 'signin',
    authIntent: null,
    accountTab: 'orders',
    modalProduct: null,
    modalQty: 1,
    checkout: {
      step: 1,
      data: {},
      delivery: 'standard',
      payment: 'card'
    },
    checkoutDone: false,
    lastOrder: null
  };

  /* ---------------------------------------------------------
     Helpers
     --------------------------------------------------------- */
  function currentUser() {
    if (!state.sessionEmail) return null;
    return state.users[state.sessionEmail] || null;
  }

  function persistCart() {
    state.cart = state.cart.filter((line) => byId(line.id));
    store.set(STORAGE.cart, state.cart);
    updateBadges();
    renderCart();
  }

  function persistWishlist() {
    state.wishlist = [...new Set(state.wishlist)].filter((id) => byId(id));
    store.set(STORAGE.wishlist, state.wishlist);
    updateBadges();
    renderGrid();
    renderWishlist();
  }

  function persistUsers() {
    store.set(STORAGE.users, state.users);
  }

  function cartLines() {
    return state.cart
      .map((line) => {
        const product = byId(line.id);
        return product ? { ...line, product, lineTotal: product.price * line.qty } : null;
      })
      .filter(Boolean);
  }

  function cartSubtotal() {
    return cartLines().reduce((sum, line) => sum + line.lineTotal, 0);
  }

  function cartQty() {
    return state.cart.reduce((sum, line) => sum + line.qty, 0);
  }

  const PROMOS = { LAYEMI10: 0.1, WELCOME5: 0.05, TURBAN15: 0.15 };

  function discountAmount() {
    if (!state.promo || !PROMOS[state.promo]) return 0;
    return Math.round(cartSubtotal() * PROMOS[state.promo]);
  }

  function baseShipping() {
    const region = state.checkout.data.region || 'Lagos';
    if (region === 'International') return 25000;
    if (cartSubtotal() >= 75000) return 0;
    return region === 'Lagos' ? 2500 : 5000;
  }

  function shippingAmount() {
    if (state.checkout.delivery === 'pickup') return 0;
    let total = baseShipping();
    if (state.checkout.delivery === 'express') total += 7000;
    return total;
  }

  function orderTotal() {
    return Math.max(0, cartSubtotal() - discountAmount() + shippingAmount());
  }

  function toast(message, icon = '✦') {
    const wrap = $('#toast-wrap');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="toast-icon">${icon}</span><span>${escapeHTML(message)}</span>`;
    wrap.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 320);
    }, 2800);
  }

  async function hashPassword(password) {
    if (window.crypto && window.crypto.subtle) {
      try {
        const data = new TextEncoder().encode(password + '::layemiturban');
        const digest = await window.crypto.subtle.digest('SHA-256', data);
        return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
      } catch (err) { /* fall through */ }
    }
    let hash = 2166136261;
    for (let i = 0; i < password.length; i += 1) {
      hash ^= password.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv_${(hash >>> 0).toString(16)}`;
  }

  function syncBodyLock() {
    const openers = ['#cart-drawer', '#wishlist-drawer', '#mobile-menu', '#search-overlay', '#product-modal', '#auth-modal', '#account-modal', '#checkout-modal'];
    const anyOpen = openers.some((sel) => {
      const el = $(sel);
      return el && !el.classList.contains('hidden');
    });
    document.body.classList.toggle('locked', anyOpen);
  }

  /* ---------------------------------------------------------
     Header / badges
     --------------------------------------------------------- */
  function updateBadges() {
    const count = cartQty();
    const cartBadge = $('#cart-count');
    cartBadge.textContent = count;
    cartBadge.classList.toggle('hidden', count === 0);

    const wishBadge = $('#wishlist-count');
    wishBadge.textContent = state.wishlist.length;
    wishBadge.classList.toggle('hidden', state.wishlist.length === 0);

    $('#cart-drawer-count').textContent = `${count} ${count === 1 ? 'piece' : 'pieces'}`;
  }

  /* ---------------------------------------------------------
     Product grid
     --------------------------------------------------------- */
  function filteredProducts() {
    let list = [...PRODUCTS];
    const term = state.search.trim().toLowerCase();

    if (state.filter !== 'all') {
      if (state.filter === 'under10') {
        list = list.filter((p) => p.price < 10000);
      } else {
        list = list.filter((p) => p.tags.includes(state.filter) || p.category === state.filter);
      }
    }

    if (term) {
      list = list.filter((p) =>
        [p.name, p.color, p.material, p.category, p.edition, p.description]
          .join(' ')
          .toLowerCase()
          .includes(term)
      );
    }

    if (state.sort === 'price-asc') list.sort((a, b) => a.price - b.price);
    else if (state.sort === 'price-desc') list.sort((a, b) => b.price - a.price);
    else if (state.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));

    return list;
  }

  function renderGrid() {
    const grid = $('#product-grid');
    const empty = $('#empty-state');
    if (!grid) return;

    const list = filteredProducts();
    const countEl = $('#product-count');
    if (countEl) countEl.textContent = list.length;

    grid.innerHTML = list
      .map((p, index) => {
        const wished = state.wishlist.includes(p.id);
        const badgeClass = p.badge === 'Bestseller' ? 'dark' : '';
        return `
          <article class="product-card group" data-product="${p.id}" style="animation-delay:${index * 20}ms">
            <div class="product-media">
              ${p.badge ? `<span class="product-badge ${badgeClass}">${escapeHTML(p.badge)}</span>` : ''}
              <button class="wish-btn ${wished ? 'is-active' : ''}" data-wish="${p.id}" aria-label="${wished ? 'Remove from' : 'Add to'} wishlist">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 20s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 6.7 4.5 4.5 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/></svg>
              </button>
              <img src="${p.image}" alt="${escapeHTML(p.name)}" loading="lazy" />
              <button class="quick-add" data-add="${p.id}">
                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path stroke-linecap="round" d="M12 5v14M5 12h14"/></svg>
                Add to bag
              </button>
            </div>
            <div class="mt-3.5 flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-[8px] uppercase tracking-[0.18em] text-ink/40">${escapeHTML(p.category)} · ${escapeHTML(p.edition)}</p>
                <h3 class="mt-1 truncate font-display text-[19px] leading-tight">${escapeHTML(p.name)}</h3>
                <p class="mt-0.5 text-[10px] text-ink/45">${escapeHTML(p.color)}</p>
              </div>
              <div class="shrink-0 text-right">
                <p class="product-price text-[13px] font-medium">${money(p.price)}</p>
                ${p.compareAt ? `<p class="text-[10px] text-ink/35 line-through">${money(p.compareAt)}</p>` : ''}
              </div>
            </div>
          </article>`;
      })
      .join('');

    empty.classList.toggle('hidden', list.length > 0);
    grid.classList.toggle('hidden', list.length === 0);
  }

  function setFilter(filter) {
    state.filter = filter;
    $$('#filter-bar .filter-chip').forEach((chip) => {
      chip.classList.toggle('is-active', chip.dataset.filter === filter);
    });
    renderGrid();
  }

  /* ---------------------------------------------------------
     Cart
     --------------------------------------------------------- */
  function addToCart(id, qty = 1, silent = false) {
    const product = byId(id);
    if (!product) return;
    const existing = state.cart.find((line) => line.id === id);
    const nextQty = (existing ? existing.qty : 0) + qty;

    if (nextQty > product.stock) {
      if (existing) existing.qty = product.stock;
      else state.cart.push({ id, qty: product.stock });
      persistCart();
      toast(`Only ${product.stock} pieces of this style available`, '!');
      return;
    }

    if (existing) existing.qty = nextQty;
    else state.cart.push({ id, qty });
    persistCart();
    if (!silent) toast(`${product.name} added to your bag`, '✦');
  }

  function updateCartQty(id, delta) {
    const line = state.cart.find((item) => item.id === id);
    if (!line) return;
    const product = byId(id);
    const next = line.qty + delta;
    if (next <= 0) {
      state.cart = state.cart.filter((item) => item.id !== id);
    } else if (next > product.stock) {
      toast(`Only ${product.stock} pieces available`, '!');
      return;
    } else {
      line.qty = next;
    }
    persistCart();
    if (state.checkoutDone === false && !$('#checkout-modal').classList.contains('hidden')) {
      renderCheckout();
    }
  }

  function removeFromCart(id) {
    state.cart = state.cart.filter((line) => line.id !== id);
    persistCart();
    toast('Removed from your bag', '—');
  }

  function renderCart() {
    const wrap = $('#cart-items');
    if (!wrap) return;
    const lines = cartLines();

    if (!lines.length) {
      wrap.innerHTML = `
        <div class="flex h-full min-h-[280px] flex-col items-center justify-center text-center">
          <div class="grid h-16 w-16 place-items-center rounded-full border border-gold/30 text-gold">
            <svg class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="1.3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 8h12l-1 12H7L6 8Z"/><path stroke-linecap="round" d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>
          </div>
          <p class="mt-5 font-display text-2xl">Your bag is empty</p>
          <p class="mt-1 max-w-[220px] text-xs font-light text-ink/45">Beautiful things are waiting. Start with a signature wrap.</p>
          <button class="btn-ghost mt-6" data-close-cart>Discover pieces</button>
        </div>`;
      $('#cart-subtotal').textContent = money(0);
      $('#shipping-percent').textContent = '0%';
      $('#shipping-bar').style.width = '0%';
      $('#shipping-message').textContent = 'Free shipping over ₦75,000';
      $('#checkout-btn').disabled = true;
      $('#promo-note').classList.add('hidden');
      return;
    }

    wrap.innerHTML = lines
      .map(
        (line) => `
        <div class="cart-line">
          <img src="${line.product.image}" alt="${escapeHTML(line.product.name)}" class="cart-thumb" />
          <div class="flex flex-col">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-[8px] uppercase tracking-[0.16em] text-ink/40">${escapeHTML(line.product.edition)} · ${escapeHTML(line.product.color)}</p>
                <h4 class="mt-0.5 font-display text-[17px] leading-tight">${escapeHTML(line.product.name)}</h4>
              </div>
              <button class="mt-0.5 text-ink/35 transition hover:text-wine" data-cart-remove="${line.id}" aria-label="Remove ${escapeHTML(line.product.name)}">
                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" d="M5 7h14M9 7V5h6v2m-8 0 1 13h8l1-13"/></svg>
              </button>
            </div>
            <div class="mt-auto flex items-end justify-between pt-3">
              <div class="qty-control">
                <button data-cart-qty="${line.id}" data-delta="-1" aria-label="Decrease quantity">−</button>
                <span>${line.qty}</span>
                <button data-cart-qty="${line.id}" data-delta="1" aria-label="Increase quantity">+</button>
              </div>
              <p class="text-[13px] font-medium">${money(line.lineTotal)}</p>
            </div>
          </div>
        </div>`
      )
      .join('');

    const subtotal = cartSubtotal();
    const remaining = Math.max(0, 75000 - subtotal);
    const percent = Math.min(100, Math.round((subtotal / 75000) * 100));
    const free = subtotal >= 75000;

    $('#shipping-message').textContent = free
      ? 'You have unlocked complimentary shipping ✦'
      : `Add ${money(remaining)} more for free shipping`;
    $('#shipping-percent').textContent = `${percent}%`;
    $('#shipping-bar').style.width = `${percent}%`;
    $('#cart-subtotal').textContent = money(subtotal);
    $('#checkout-btn').disabled = false;

    const note = $('#promo-note');
    if (state.promo && PROMOS[state.promo]) {
      note.textContent = `Code ${state.promo} applied — ${Math.round(PROMOS[state.promo] * 100)}% off your pieces.`;
      note.className = 'mb-3 text-[11px] text-wine';
      $('#promo-input').value = state.promo;
    } else {
      note.className = 'mb-3 hidden text-[11px]';
    }
  }

  /* ---------------------------------------------------------
     Wishlist
     --------------------------------------------------------- */
  function toggleWishlist(id) {
    const product = byId(id);
    if (!product) return;
    if (state.wishlist.includes(id)) {
      state.wishlist = state.wishlist.filter((item) => item !== id);
      toast('Removed from wishlist', '♡');
    } else {
      state.wishlist.push(id);
      toast(`${product.name} saved to wishlist`, '♥');
    }
    persistWishlist();
  }

  function renderWishlist() {
    const wrap = $('#wishlist-items');
    if (!wrap) return;
    const items = state.wishlist.map(byId).filter(Boolean);

    if (!items.length) {
      wrap.innerHTML = `
        <div class="flex h-full min-h-[300px] flex-col items-center justify-center text-center">
          <div class="grid h-16 w-16 place-items-center rounded-full border border-gold/30 text-gold">
            <svg class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="1.3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 20s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 6.7 4.5 4.5 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/></svg>
          </div>
          <p class="mt-5 font-display text-2xl">Nothing saved yet</p>
          <p class="mt-1 max-w-[230px] text-xs font-light text-ink/45">Tap the heart on any piece to keep it close.</p>
          <button class="btn-ghost mt-6" data-close-wishlist>Browse the collection</button>
        </div>`;
      $('#wishlist-add-all').classList.add('hidden');
      return;
    }

    $('#wishlist-add-all').classList.remove('hidden');
    wrap.innerHTML = items
      .map(
        (p) => `
        <div class="cart-line">
          <img src="${p.image}" alt="${escapeHTML(p.name)}" class="cart-thumb cursor-pointer" data-product="${p.id}" />
          <div class="flex flex-col">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-[8px] uppercase tracking-[0.16em] text-ink/40">${escapeHTML(p.edition)}</p>
                <h4 class="mt-0.5 cursor-pointer font-display text-[17px] leading-tight" data-product="${p.id}">${escapeHTML(p.name)}</h4>
                <p class="mt-1 text-[12px]">${money(p.price)}</p>
              </div>
              <button class="text-ink/35 hover:text-wine" data-wish="${p.id}" aria-label="Remove from wishlist">
                <svg class="h-4 w-4" fill="currentColor" stroke="currentColor" stroke-width="1.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 20s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 6.7 4.5 4.5 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/></svg>
              </button>
            </div>
            <button class="mt-auto self-start pt-3 text-[9px] font-semibold uppercase tracking-[0.16em] underline underline-offset-4 hover:text-gold" data-add="${p.id}">Add to bag</button>
          </div>
        </div>`
      )
      .join('');
  }

  /* ---------------------------------------------------------
     Product quick view
     --------------------------------------------------------- */
  function openProduct(id) {
    const p = byId(id);
    if (!p) return;
    state.modalProduct = p;
    state.modalQty = 1;
    const wished = state.wishlist.includes(p.id);
    const stars = Array.from({ length: 5 }, (_, i) =>
      `<svg class="h-3 w-3 ${i < Math.round(p.rating) ? 'text-gold' : 'text-ink/15'}" fill="currentColor" viewBox="0 0 20 20"><path d="M10 1.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L1.6 7.7l5.8-.8L10 1.6Z"/></svg>`
    ).join('');

    $('#product-modal-content').innerHTML = `
      <div class="relative bg-sand">
        <img src="${p.image}" alt="${escapeHTML(p.name)}" class="h-64 w-full object-cover sm:h-80 md:h-full md:min-h-[560px]" />
        <span class="absolute left-4 top-4 rounded-full bg-cream/90 px-3 py-1.5 text-[8px] font-semibold uppercase tracking-[0.18em] backdrop-blur">${escapeHTML(p.collection)}</span>
      </div>
      <div class="flex flex-col p-6 sm:p-8">
        <p class="text-[9px] uppercase tracking-[0.22em] text-gold">${escapeHTML(p.category)} · ${escapeHTML(p.edition)} Edition</p>
        <h2 class="mt-2 font-display text-3xl leading-tight sm:text-4xl">${escapeHTML(p.name)}</h2>
        <div class="mt-2.5 flex items-center gap-2">
          <div class="flex gap-0.5">${stars}</div>
          <span class="text-[10px] text-ink/45">${p.rating.toFixed(1)} · ${p.reviews} reviews</span>
        </div>
        <div class="mt-4 flex items-baseline gap-3">
          <p class="font-display text-2xl">${money(p.price)}</p>
          ${p.compareAt ? `<p class="text-xs text-ink/35 line-through">${money(p.compareAt)}</p><span class="rounded-full bg-wine/10 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-wine">Save ${money(p.compareAt - p.price)}</span>` : ''}
        </div>
        <p class="mt-4 text-[13px] font-light leading-relaxed text-ink/60">${escapeHTML(p.description)}</p>

        <div class="mt-5 grid grid-cols-2 gap-3 text-[11px]">
          <div class="rounded-lg border border-ink/10 p-3"><p class="text-[8px] uppercase tracking-[0.16em] text-ink/40">Colour</p><p class="mt-1">${escapeHTML(p.color)}</p></div>
          <div class="rounded-lg border border-ink/10 p-3"><p class="text-[8px] uppercase tracking-[0.16em] text-ink/40">Material</p><p class="mt-1">${escapeHTML(p.material)}</p></div>
        </div>

        <ul class="mt-5 space-y-2">
          ${p.details.slice(0, 4).map((d) => `<li class="flex items-start gap-2 text-[11px] font-light text-ink/60"><span class="mt-[3px] text-gold">✦</span>${escapeHTML(d)}</li>`).join('')}
        </ul>

        <div class="mt-6 flex items-center gap-3">
          <div class="qty-control !h-11">
            <button data-modal-qty="-1" aria-label="Decrease quantity">−</button>
            <span id="modal-qty">1</span>
            <button data-modal-qty="1" aria-label="Increase quantity">+</button>
          </div>
          <button class="btn-primary flex-1 justify-center !py-3.5" data-modal-add="${p.id}">Add to bag · <span id="modal-total">${money(p.price)}</span></button>
          <button class="grid h-11 w-11 shrink-0 place-items-center rounded-full border ${wished ? 'border-wine text-wine' : 'border-ink/20 text-ink/60'} transition hover:border-wine hover:text-wine" data-wish="${p.id}" aria-label="Wishlist">
            <svg class="h-4 w-4" fill="${wished ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 20s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 6.7 4.5 4.5 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/></svg>
          </button>
        </div>

        <p class="mt-3 text-[10px] text-ink/40">${p.stock <= 6 ? `<span class="text-wine">Only ${p.stock} left</span>` : 'In stock'} · ${escapeHTML(p.status)} · Ships worldwide</p>

        <div class="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-ink/10 pt-4 text-[9px] uppercase tracking-[0.12em] text-ink/45">
          <span>✦ Keepsake packaging</span>
          <span>✦ Pickup in Ikorodu</span>
          <a class="underline underline-offset-2 transition hover:text-gold" href="https://wa.me/2349032771661?text=${encodeURIComponent('Hello LAYEMITURBAN, I would like to order the ' + p.name + '.')}" target="_blank" rel="noopener">Order via WhatsApp</a>
        </div>
      </div>`;

    $('#product-modal').classList.remove('hidden');
    syncBodyLock();
  }

  function closeProduct() {
    $('#product-modal').classList.add('hidden');
    syncBodyLock();
  }

  /* ---------------------------------------------------------
     Auth
     --------------------------------------------------------- */
  function setAuthTab(tab) {
    state.authTab = tab;
    const signup = tab === 'signup';
    $('#auth-tab-signin').classList.toggle('is-active', !signup);
    $('#auth-tab-signup').classList.toggle('is-active', signup);
    $('#auth-name-field').classList.toggle('hidden', !signup);
    $('#auth-title').textContent = signup ? 'Create your account' : 'Welcome back';
    $('#auth-subtitle').textContent = signup
      ? 'One account for faster checkout, saved addresses and order history.'
      : 'Sign in to check out faster and track your orders.';
    $('#auth-submit').textContent = signup ? 'Create account' : 'Sign in';
    $('#auth-password').setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
    $('#auth-error').classList.add('hidden');
  }

  function openAuth(tab = 'signin', intent = null) {
    state.authIntent = intent;
    setAuthTab(tab);
    $('#auth-form').reset();
    $('#auth-error').classList.add('hidden');
    $('#auth-modal').classList.remove('hidden');
    syncBodyLock();
    setTimeout(() => $('#auth-email').focus(), 350);
  }

  function closeAuth() {
    $('#auth-modal').classList.add('hidden');
    syncBodyLock();
  }

  function openAccount() {
    if (!currentUser()) {
      openAuth('signin', 'account');
      return;
    }
    state.accountTab = 'orders';
    renderAccount();
    $('#account-modal').classList.remove('hidden');
    syncBodyLock();
  }

  function closeAccount() {
    $('#account-modal').classList.add('hidden');
    syncBodyLock();
  }

  function renderAccount() {
    const user = currentUser();
    if (!user) return;
    const orders = user.orders || [];
    const initials = user.name
      .split(' ')
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    $('#account-heading').textContent = `Hello, ${user.name.split(' ')[0]}`;

    const ordersHTML = orders.length
      ? [...orders].reverse().map((order) => `
          <div class="order-card">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="text-[9px] uppercase tracking-[0.16em] text-ink/40">${new Date(order.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                <p class="mt-1 font-display text-lg">${order.id}</p>
              </div>
              <span class="order-status">${escapeHTML(order.status)}</span>
            </div>
            <div class="mt-3 flex items-center gap-2">
              ${order.items.slice(0, 4).map((item) => `<img src="${item.image}" alt="${escapeHTML(item.name)}" class="h-14 w-11 rounded-sm object-cover" />`).join('')}
              <div class="ml-auto text-right">
                <p class="text-[9px] uppercase tracking-[0.14em] text-ink/40">${order.items.reduce((s, i) => s + i.qty, 0)} items</p>
                <p class="font-medium">${money(order.total)}</p>
              </div>
            </div>
            <div class="mt-3 flex justify-between border-t border-ink/10 pt-3 text-[9px] uppercase tracking-[0.14em]">
              <span class="text-ink/40">${escapeHTML(order.delivery)} delivery · ${escapeHTML(order.payment)}</span>
              <button class="font-semibold underline underline-offset-4 hover:text-gold" data-reorder="${order.id}">Reorder</button>
            </div>
          </div>`).join('')
      : `<div class="rounded-xl border border-dashed border-ink/20 py-12 text-center">
           <p class="font-display text-2xl">No orders yet</p>
           <p class="mt-1 text-xs font-light text-ink/45">Your first crown is waiting.</p>
           <button class="btn-primary mt-5 !py-3" data-close-account>Start shopping</button>
         </div>`;

    const address = user.address || {};

    $('#account-body').innerHTML = `
      <div class="flex items-center gap-4">
        <div class="grid h-14 w-14 place-items-center rounded-full bg-ink font-display text-xl text-cream">${escapeHTML(initials)}</div>
        <div class="min-w-0 flex-1">
          <p class="font-display text-xl leading-tight">${escapeHTML(user.name)}</p>
          <p class="truncate text-xs text-ink/45">${escapeHTML(user.email)}</p>
        </div>
        <div class="text-right">
          <p class="font-display text-2xl">${orders.length}</p>
          <p class="text-[8px] uppercase tracking-[0.16em] text-ink/40">Orders</p>
        </div>
      </div>

      <div class="mt-6 flex gap-1 rounded-full border border-ink/10 bg-sand/50 p-1">
        <button class="auth-tab ${state.accountTab === 'orders' ? 'is-active' : ''}" data-account-tab="orders">Orders</button>
        <button class="auth-tab ${state.accountTab === 'profile' ? 'is-active' : ''}" data-account-tab="profile">Profile & address</button>
      </div>

      <div class="mt-5">
        ${state.accountTab === 'orders' ? `<div class="space-y-3">${ordersHTML}</div>` : `
          <form id="profile-form" class="space-y-3" novalidate>
            <div><label class="field-label" for="profile-name">Full name</label><input id="profile-name" class="field-input" value="${escapeHTML(user.name)}" required /></div>
            <div><label class="field-label" for="profile-email">Email</label><input id="profile-email" class="field-input" value="${escapeHTML(user.email)}" readonly /></div>
            <div><label class="field-label" for="profile-phone">Phone</label><input id="profile-phone" class="field-input" value="${escapeHTML(user.phone || '')}" placeholder="+234 …" /></div>
            <div><label class="field-label" for="profile-address">Delivery address</label><input id="profile-address" class="field-input" value="${escapeHTML(address.street || '')}" placeholder="Street, area" /></div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="field-label" for="profile-city">City</label><input id="profile-city" class="field-input" value="${escapeHTML(address.city || '')}" placeholder="Lagos" /></div>
              <div><label class="field-label" for="profile-region">Region</label>
                <select id="profile-region" class="field-input">
                  ${['Lagos', 'Nigeria (outside Lagos)', 'International'].map((r) => `<option ${address.region === r ? 'selected' : ''}>${r}</option>`).join('')}
                </select>
              </div>
            </div>
            <button class="btn-primary w-full justify-center" type="submit">Save changes</button>
          </form>
          <button class="mt-4 w-full rounded-full border border-wine/25 py-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-wine transition hover:bg-wine hover:text-cream" data-signout>Sign out</button>
          <p class="mt-4 text-center text-[9px] leading-relaxed text-ink/35">Demo account stored locally on this device. No data leaves your browser.</p>
        `}
      </div>`;
  }

  function handleAuthSubmit(e) {
    e.preventDefault();
    const name = $('#auth-name').value.trim();
    const email = $('#auth-email').value.trim().toLowerCase();
    const password = $('#auth-password').value;
    const errorEl = $('#auth-error');
    const showError = (msg) => {
      errorEl.textContent = msg;
      errorEl.classList.remove('hidden');
    };

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError('Please enter a valid email address.');
    if (password.length < 6) return showError('Password must be at least 6 characters.');
    if (state.authTab === 'signup' && name.length < 2) return showError('Please tell us your full name.');

    const submit = $('#auth-submit');
    submit.disabled = true;

    hashPassword(password).then((hash) => {
      if (state.authTab === 'signup') {
        if (state.users[email]) {
          submit.disabled = false;
          state.authTab = 'signin';
          setAuthTab('signin');
          showError('An account with this email already exists. Please sign in.');
          return;
        }
        state.users[email] = {
          id: 'LTU-' + Date.now().toString(36).toUpperCase(),
          name,
          email,
          phone: '',
          pass: hash,
          createdAt: new Date().toISOString(),
          orders: [],
          address: {}
        };
        persistUsers();
        state.sessionEmail = email;
        store.set(STORAGE.session, email);
        submit.disabled = false;
        closeAuth();
        toast(`Welcome to LAYEMITURBAN, ${name.split(' ')[0]}`, '✦');
        finishAuthIntent();
      } else {
        const user = state.users[email];
        if (!user || user.pass !== hash) {
          submit.disabled = false;
          return showError('That email and password combination does not match our records.');
        }
        state.sessionEmail = email;
        store.set(STORAGE.session, email);
        submit.disabled = false;
        closeAuth();
        toast(`Welcome back, ${user.name.split(' ')[0]}`, '✦');
        finishAuthIntent();
      }
    });
  }

  function finishAuthIntent() {
    const intent = state.authIntent;
    state.authIntent = null;
    if (intent === 'checkout') {
      setTimeout(openCheckout, 280);
    } else if (intent === 'account') {
      setTimeout(openAccount, 280);
    }
  }

  /* ---------------------------------------------------------
     Checkout
     --------------------------------------------------------- */
  function openCheckout() {
    if (!cartLines().length) {
      toast('Your bag is empty — add a piece first', '!');
      return;
    }
    if (!currentUser()) {
      closeCart();
      openAuth('signin', 'checkout');
      return;
    }

    const user = currentUser();
    state.checkout.step = 1;
    state.checkout.done = false;
    state.checkoutDone = false;
    const saved = user.address || {};
    state.checkout.data = {
      fullName: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      street: saved.street || '',
      city: saved.city || '',
      region: saved.region || 'Lagos',
      notes: ''
    };
    state.checkout.delivery = 'standard';
    state.checkout.payment = 'card';

    closeCart();
    $('#checkout-modal').classList.remove('hidden');
    $('#checkout-steps').classList.remove('hidden');
    const summaryPanel = $('.order-summary');
    if (summaryPanel) summaryPanel.classList.remove('hidden');
    syncBodyLock();
    renderCheckout();
  }

  function closeCheckout() {
    $('#checkout-modal').classList.add('hidden');
    syncBodyLock();
  }

  function setCheckoutStep(step) {
    state.checkout.step = step;
    renderCheckout();
    $('#checkout-modal').querySelector('.flex-1').scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderCheckout() {
    if (state.checkout.done) return;
    const step = state.checkout.step;
    const data = state.checkout.data;
    const user = currentUser();

    /* indicators */
    $$('[data-step-indicator]').forEach((el) => {
      const num = Number(el.dataset.stepIndicator);
      el.classList.toggle('is-active', num === step);
      el.classList.toggle('is-done', num < step);
    });

    /* summary */
    renderCheckoutSummary();

    const main = $('#checkout-main');

    if (step === 1) {
      main.innerHTML = `
        <div class="step-panel">
          <p class="eyebrow">Step 1 of 3</p>
          <h2 class="mt-2 font-display text-3xl">Your details</h2>
          <p class="mt-1 text-xs font-light text-ink/50">Signed in as <span class="text-ink">${escapeHTML(user.email)}</span></p>
          <form id="details-form" class="mt-6 space-y-3.5" novalidate>
            <div class="grid gap-3.5 sm:grid-cols-2">
              <div><label class="field-label" for="co-name">Full name *</label><input id="co-name" class="field-input" value="${escapeHTML(data.fullName)}" placeholder="Your full name" required /></div>
              <div><label class="field-label" for="co-phone">Phone number *</label><input id="co-phone" class="field-input" value="${escapeHTML(data.phone)}" placeholder="+234 800 000 0000" inputmode="tel" required /></div>
            </div>
            <div><label class="field-label" for="co-street">Delivery address *</label><input id="co-street" class="field-input" value="${escapeHTML(data.street)}" placeholder="House number, street, area" required /></div>
            <div class="grid gap-3.5 sm:grid-cols-2">
              <div><label class="field-label" for="co-city">City *</label><input id="co-city" class="field-input" value="${escapeHTML(data.city)}" placeholder="Lagos" required /></div>
              <div>
                <label class="field-label" for="co-region">Region *</label>
                <select id="co-region" class="field-input">
                  ${['Lagos', 'Nigeria (outside Lagos)', 'International'].map((r) => `<option ${data.region === r ? 'selected' : ''}>${r}</option>`).join('')}
                </select>
              </div>
            </div>
            <div><label class="field-label" for="co-notes">Order notes <span class="normal-case tracking-normal text-ink/30">(optional)</span></label><textarea id="co-notes" class="field-input" placeholder="Colour notes, delivery instructions, gift message…"></textarea></div>
            <div class="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" class="btn-ghost justify-center" data-close-checkout>Back to shop</button>
              <button type="submit" class="btn-primary justify-center">Continue to delivery <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14m-5-5 5 5-5 5"/></svg></button>
            </div>
          </form>
        </div>`;

      $('#co-notes').value = data.notes || '';
      $('#co-region').addEventListener('change', (e) => {
        data.region = e.target.value;
        renderCheckoutSummary();
      });
      $('#details-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const required = ['co-name', 'co-phone', 'co-street', 'co-city'];
        let valid = true;
        required.forEach((id) => {
          const input = $('#' + id);
          const bad = !input.value.trim();
          input.classList.toggle('error', bad);
          if (bad) valid = false;
        });
        if (!valid) {
          toast('Please complete the required delivery details', '!');
          return;
        }
        Object.assign(data, {
          fullName: $('#co-name').value.trim(),
          phone: $('#co-phone').value.trim(),
          street: $('#co-street').value.trim(),
          city: $('#co-city').value.trim(),
          region: $('#co-region').value,
          notes: $('#co-notes').value.trim()
        });

        /* save address silently to the account */
        const user = currentUser();
        if (user) {
          user.phone = data.phone;
          user.address = { street: data.street, city: data.city, region: data.region };
          state.users[user.email] = user;
          persistUsers();
        }
        setCheckoutStep(2);
      });
    }

    if (step === 2) {
      const base = baseShipping();
      const freeStandard = base === 0;
      const deliveryOptions = [
        { key: 'standard', title: 'Standard delivery', desc: data.region === 'International' ? '7–14 business days · tracked' : '3–6 business days · tracked', price: freeStandard ? 'Free' : money(base) },
        { key: 'express', title: 'Express delivery', desc: data.region === 'International' ? '3–5 business days · DHL' : '1–2 business days · courier', price: money(base + 7000) },
        { key: 'pickup', title: 'Studio pickup', desc: 'Collect from our Ikorodu atelier, Lagos', price: 'Free' }
      ];

      main.innerHTML = `
        <div class="step-panel">
          <p class="eyebrow">Step 2 of 3</p>
          <h2 class="mt-2 font-display text-3xl">Delivery method</h2>
          <p class="mt-1 text-xs font-light text-ink/50">Shipping to ${escapeHTML(data.city || 'your address')}, ${escapeHTML(data.region)}.</p>
          <form id="delivery-form" class="mt-6 space-y-3">
            ${deliveryOptions.map((opt) => `
              <label class="pay-option ${state.checkout.delivery === opt.key ? 'is-active' : ''}" data-delivery-option="${opt.key}">
                <input type="radio" name="delivery" value="${opt.key}" class="mt-1 h-4 w-4 accent-[#17140f]" ${state.checkout.delivery === opt.key ? 'checked' : ''} />
                <span class="flex-1">
                  <span class="flex items-center justify-between gap-3">
                    <span class="text-sm font-medium">${opt.title}</span>
                    <span class="text-sm font-medium">${opt.price}</span>
                  </span>
                  <span class="mt-0.5 block text-[11px] font-light text-ink/45">${opt.desc}</span>
                </span>
              </label>`).join('')}
            <div class="rounded-xl bg-sand/60 p-4 text-[11px] font-light leading-relaxed text-ink/55">
              <p class="mb-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-ink/45">Delivery address</p>
              ${escapeHTML(data.fullName)} · ${escapeHTML(data.phone)}<br />
              ${escapeHTML(data.street)}, ${escapeHTML(data.city)}, ${escapeHTML(data.region)}
              <button type="button" class="ml-1 underline underline-offset-2 hover:text-gold" data-edit-address>Edit</button>
            </div>
            <div class="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" class="btn-ghost justify-center" data-checkout-back>Back</button>
              <button type="submit" class="btn-primary justify-center">Continue to payment <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14m-5-5 5 5-5 5"/></svg></button>
            </div>
          </form>
        </div>`;

      $$('#delivery-form [data-delivery-option]').forEach((label) => {
        label.addEventListener('click', () => {
          const key = label.dataset.deliveryOption;
          state.checkout.delivery = key;
          $$('#delivery-form [data-delivery-option]').forEach((el) => el.classList.toggle('is-active', el === label));
          renderCheckoutSummary();
        });
      });
      $('#delivery-form').addEventListener('submit', (e) => {
        e.preventDefault();
        setCheckoutStep(3);
      });
      $('[data-edit-address]').addEventListener('click', () => setCheckoutStep(1));
      $('[data-checkout-back]').addEventListener('click', () => setCheckoutStep(1));
    }

    if (step === 3) {
      const method = state.checkout.payment;
      main.innerHTML = `
        <div class="step-panel">
          <p class="eyebrow">Step 3 of 3</p>
          <h2 class="mt-2 font-display text-3xl">Payment</h2>
          <p class="mt-1 text-xs font-light text-ink/50">All transactions are encrypted. This is a demo — no real payment is taken.</p>
          <form id="payment-form" class="mt-6 space-y-3" novalidate>
            <label class="pay-option ${method === 'card' ? 'is-active' : ''}" data-pay-option="card">
              <input type="radio" name="payment" value="card" class="mt-1 h-4 w-4 accent-[#17140f]" ${method === 'card' ? 'checked' : ''} />
              <span class="flex-1">
                <span class="flex items-center justify-between"><span class="text-sm font-medium">Credit / debit card</span><span class="text-base">💳</span></span>
                <span class="mt-0.5 block text-[11px] font-light text-ink/45">Visa, Mastercard, Verve</span>
              </span>
            </label>
            <div id="card-fields" class="${method === 'card' ? '' : 'hidden'} space-y-3 rounded-xl border border-ink/10 p-4">
              <div><label class="field-label" for="card-number">Card number</label><input id="card-number" class="field-input" inputmode="numeric" placeholder="4242 4242 4242 4242" maxlength="19" /></div>
              <div class="grid grid-cols-2 gap-3">
                <div><label class="field-label" for="card-expiry">Expiry</label><input id="card-expiry" class="field-input" inputmode="numeric" placeholder="MM/YY" maxlength="5" /></div>
                <div><label class="field-label" for="card-cvc">CVC</label><input id="card-cvc" class="field-input" inputmode="numeric" placeholder="123" maxlength="4" /></div>
              </div>
            </div>
            <label class="pay-option ${method === 'transfer' ? 'is-active' : ''}" data-pay-option="transfer">
              <input type="radio" name="payment" value="transfer" class="mt-1 h-4 w-4 accent-[#17140f]" ${method === 'transfer' ? 'checked' : ''} />
              <span class="flex-1"><span class="flex items-center justify-between"><span class="text-sm font-medium">Bank transfer</span><span class="text-base">🏦</span></span><span class="mt-0.5 block text-[11px] font-light text-ink/45">Account details sent instantly after order</span></span>
            </label>
            <label class="pay-option ${method === 'cod' ? 'is-active' : ''}" data-pay-option="cod">
              <input type="radio" name="payment" value="cod" class="mt-1 h-4 w-4 accent-[#17140f]" ${method === 'cod' ? 'checked' : ''} ${data.region !== 'Lagos' ? 'disabled' : ''} />
              <span class="flex-1"><span class="flex items-center justify-between"><span class="text-sm font-medium ${data.region !== 'Lagos' ? 'opacity-40' : ''}">Pay on delivery</span><span class="text-base">🤝</span></span><span class="mt-0.5 block text-[11px] font-light text-ink/45">${data.region === 'Lagos' ? 'Lagos only · cash or transfer on arrival' : 'Available for Lagos deliveries only'}</span></span>
            </label>
            <p id="payment-error" class="hidden rounded-lg bg-wine/10 px-3 py-2 text-[11px] text-wine"></p>
            <div class="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" class="btn-ghost justify-center" data-checkout-back>Back</button>
              <button type="submit" class="btn-primary justify-center" id="place-order">Place order · ${money(orderTotal())}</button>
            </div>
            <p class="text-center text-[9px] uppercase tracking-[0.14em] text-ink/35">✦ Secure demo checkout · Your details stay on this device</p>
          </form>
        </div>`;

      $$('#payment-form [data-pay-option]').forEach((label) => {
        label.addEventListener('click', () => {
          const key = label.dataset.payOption;
          const input = label.querySelector('input');
          if (input.disabled) {
            toast('Pay on delivery is only available in Lagos', '!');
            return;
          }
          state.checkout.payment = key;
          $$('#payment-form [data-pay-option]').forEach((el) => el.classList.toggle('is-active', el === label));
          $('#card-fields').classList.toggle('hidden', key !== 'card');
        });
      });

      $('[data-checkout-back]').addEventListener('click', () => setCheckoutStep(2));

      $('#card-number').addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
      });
      $('#card-expiry').addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, '').slice(0, 4);
        if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
        e.target.value = v;
      });
      $('#card-cvc').addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
      });

      $('#payment-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const errEl = $('#payment-error');
        errEl.classList.add('hidden');
        const methodNow = state.checkout.payment;

        if (methodNow === 'card') {
          const number = $('#card-number').value.replace(/\s/g, '');
          const expiry = $('#card-expiry').value;
          const cvc = $('#card-cvc').value;
          let msg = '';
          if (number.length !== 16) msg = 'Please enter a valid 16-digit card number.';
          else if (!/^\d{2}\/\d{2}$/.test(expiry)) msg = 'Please enter the card expiry as MM/YY.';
          else if (cvc.length < 3) msg = 'Please enter the 3-digit CVC.';
          if (msg) {
            errEl.textContent = msg;
            errEl.classList.remove('hidden');
            return;
          }
        }

        placeOrder();
      });
    }
  }

  function renderCheckoutSummary() {
    const lines = cartLines();
    const count = cartQty();
    const summaryItems = $('#summary-items');
    if (!summaryItems) return;

    summaryItems.innerHTML = lines
      .map((line) => `
        <div class="flex items-center gap-3">
          <div class="relative shrink-0">
            <img src="${line.product.image}" alt="${escapeHTML(line.product.name)}" class="summary-thumb" />
            <span class="absolute -right-1.5 -top-1.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-ink px-1 text-[8px] text-cream">${line.qty}</span>
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[11px] font-medium">${escapeHTML(line.product.name)}</p>
            <p class="text-[9px] text-ink/40">${escapeHTML(line.product.edition)}</p>
          </div>
          <p class="text-[11px]">${money(line.lineTotal)}</p>
        </div>`)
      .join('');

    $('#summary-count').textContent = `${count} ${count === 1 ? 'item' : 'items'}`;
    $('#summary-subtotal').textContent = money(cartSubtotal());
    $('#summary-shipping').textContent = shippingAmount() === 0 ? 'Free' : money(shippingAmount());

    const discountRow = $('#summary-discount-row');
    if (discountAmount() > 0) {
      discountRow.classList.remove('hidden');
      discountRow.classList.add('flex');
      $('#summary-discount').textContent = '−' + money(discountAmount());
    } else {
      discountRow.classList.add('hidden');
      discountRow.classList.remove('flex');
    }
    $('#summary-total').textContent = money(orderTotal());

    const placeBtn = $('#place-order');
    if (placeBtn) placeBtn.textContent = `Place order · ${money(orderTotal())}`;
  }

  function placeOrder() {
    const user = currentUser();
    if (!user || !cartLines().length) return;
    const btn = $('#place-order');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-cream/30 border-t-cream"></span> Processing…';
    }

    const lines = cartLines();
    const order = {
      id: 'LT-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
      date: new Date().toISOString(),
      status: 'Processing',
      items: lines.map((line) => ({
        id: line.product.id,
        name: line.product.name,
        edition: line.product.edition,
        price: line.product.price,
        qty: line.qty,
        image: line.product.image
      })),
      subtotal: cartSubtotal(),
      discount: discountAmount(),
      promo: state.promo,
      shipping: shippingAmount(),
      total: orderTotal(),
      delivery: state.checkout.delivery === 'pickup' ? 'Studio pickup' : state.checkout.delivery === 'express' ? 'Express' : 'Standard',
      payment: state.checkout.payment === 'card' ? 'Card' : state.checkout.payment === 'transfer' ? 'Bank transfer' : 'Pay on delivery',
      address: {
        name: state.checkout.data.fullName,
        phone: state.checkout.data.phone,
        street: state.checkout.data.street,
        city: state.checkout.data.city,
        region: state.checkout.data.region,
        notes: state.checkout.data.notes
      }
    };

    setTimeout(() => {
      user.orders = user.orders || [];
      user.orders.push(order);
      user.phone = state.checkout.data.phone;
      user.address = {
        street: state.checkout.data.street,
        city: state.checkout.data.city,
        region: state.checkout.data.region
      };
      state.users[user.email] = user;
      persistUsers();

      state.lastOrder = order;
      state.cart = [];
      state.promo = null;
      store.remove(STORAGE.cart);
      store.remove(STORAGE.promo);
      state.checkoutDone = true;
      state.checkout.done = true;
      updateBadges();
      renderCart();

      $('#checkout-steps').classList.add('hidden');
      $('#checkout-main').innerHTML = successHTML(order);
      const summary = $('.order-summary');
      if (summary) summary.classList.add('hidden');
      $('#checkout-modal').querySelector('.flex-1').scrollTo({ top: 0, behavior: 'smooth' });
      bindSuccess(order);
    }, 1300);
  }

  function successHTML(order) {
    return `
      <div class="step-panel mx-auto max-w-2xl text-center">
        <div class="success-mark mx-auto grid h-20 w-20 place-items-center rounded-full bg-ink text-3xl text-goldlight">✦</div>
        <p class="mt-6 text-[10px] uppercase tracking-[0.3em] text-gold">Order confirmed</p>
        <h2 class="mt-2 font-display text-4xl leading-tight sm:text-5xl">Thank you, ${escapeHTML(order.address.name.split(' ')[0])}.</h2>
        <p class="mx-auto mt-3 max-w-md text-sm font-light leading-relaxed text-ink/55">Your crown is being prepared in our Ikorodu atelier. A confirmation has been saved to your account — we will reach out on WhatsApp to arrange delivery.</p>

        <div class="mt-8 rounded-2xl border border-ink/10 bg-sand/40 p-5 text-left">
          <div class="flex items-center justify-between border-b border-ink/10 pb-3">
            <div><p class="text-[9px] uppercase tracking-[0.16em] text-ink/40">Order number</p><p class="font-display text-xl">${order.id}</p></div>
            <span class="order-status">${order.status}</span>
          </div>
          <div class="mt-3 grid gap-3 text-[11px] sm:grid-cols-2">
            <div><p class="text-[9px] uppercase tracking-[0.14em] text-ink/40">Delivering to</p><p class="mt-1 leading-relaxed">${escapeHTML(order.address.street)}, ${escapeHTML(order.address.city)}, ${escapeHTML(order.address.region)}</p></div>
            <div class="sm:text-right"><p class="text-[9px] uppercase tracking-[0.14em] text-ink/40">Total paid</p><p class="mt-1 font-display text-xl">${money(order.total)}</p></div>
          </div>
          <div class="mt-4 space-y-2 border-t border-ink/10 pt-3">
            ${order.items.map((item) => `<div class="flex items-center gap-3"><img src="${item.image}" alt="${escapeHTML(item.name)}" class="h-12 w-9 rounded-sm object-cover" /><div class="min-w-0 flex-1"><p class="truncate text-[11px]">${escapeHTML(item.name)}</p><p class="text-[9px] text-ink/40">Qty ${item.qty}</p></div><p class="text-[11px]">${money(item.price * item.qty)}</p></div>`).join('')}
          </div>
        </div>

        <div class="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <a class="btn-primary justify-center" href="https://wa.me/2349032771661?text=${encodeURIComponent(`Hello LAYEMITURBAN, I just placed order ${order.id}. I would like to arrange delivery.`)}" target="_blank" rel="noopener">Confirm on WhatsApp</a>
          <button class="btn-ghost justify-center" data-success-account>View my orders</button>
          <button class="btn-ghost justify-center" data-success-shop>Continue shopping</button>
        </div>
        <p class="mt-5 text-[9px] uppercase tracking-[0.14em] text-ink/35">A copy of this order lives in your account</p>
      </div>`;
  }

  function bindSuccess(order) {
    $('[data-success-account]').addEventListener('click', () => {
      closeCheckout();
      setTimeout(openAccount, 260);
    });
    $('[data-success-shop]').addEventListener('click', () => {
      closeCheckout();
      document.getElementById('shop').scrollIntoView({ behavior: 'smooth' });
    });
  }

  /* ---------------------------------------------------------
     Overlays
     --------------------------------------------------------- */
  function openOverlay(id, panelSelector) {
    const overlay = $(id);
    if (!overlay) return;
    const panel = panelSelector ? overlay.querySelector(panelSelector) : null;
    overlay.classList.remove('hidden');
    if (panel) {
      requestAnimationFrame(() => {
        panel.classList.remove('translate-x-full', '-translate-x-full');
      });
    }
    syncBodyLock();
  }

  function closeOverlay(id, panelSelector) {
    const overlay = $(id);
    if (!overlay) return;
    const panel = panelSelector ? overlay.querySelector(panelSelector) : null;
    if (panel) {
      panel.classList.add(id === '#mobile-menu' ? '-translate-x-full' : 'translate-x-full');
      setTimeout(() => overlay.classList.add('hidden'), 280);
    } else {
      overlay.classList.add('hidden');
    }
    setTimeout(syncBodyLock, 300);
  }

  function openCart() {
    renderCart();
    openOverlay('#cart-drawer', '.drawer-panel');
  }
  function closeCart() { closeOverlay('#cart-drawer', '.drawer-panel'); }
  function openWishlist() {
    renderWishlist();
    openOverlay('#wishlist-drawer', '.drawer-panel');
  }
  function closeWishlist() { closeOverlay('#wishlist-drawer', '.drawer-panel'); }
  function openMobile() { openOverlay('#mobile-menu', '.drawer-panel'); }
  function closeMobile() { closeOverlay('#mobile-menu', '.drawer-panel'); }
  function openSearch() {
    $('#search-overlay').classList.remove('hidden');
    syncBodyLock();
    renderSearchResults('');
    setTimeout(() => $('#overlay-search').focus(), 150);
  }
  function closeSearch() {
    $('#search-overlay').classList.add('hidden');
    syncBodyLock();
  }

  function renderSearchResults(term) {
    const wrap = $('#search-results');
    const q = term.trim().toLowerCase();
    let results = PRODUCTS;
    if (q) {
      results = PRODUCTS.filter((p) =>
        [p.name, p.color, p.category, p.edition, p.material].join(' ').toLowerCase().includes(q)
      );
    }
    results = results.slice(0, 6);
    wrap.innerHTML = results.length
      ? results.map((p) => `
          <button class="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-sand" data-search-product="${p.id}">
            <img src="${p.image}" alt="${escapeHTML(p.name)}" class="h-14 w-11 rounded-sm object-cover" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-[12px] font-medium">${escapeHTML(p.name)}</p>
              <p class="text-[9px] uppercase tracking-[0.12em] text-ink/40">${escapeHTML(p.category)} · ${escapeHTML(p.edition)}</p>
            </div>
            <span class="text-[11px]">${money(p.price)}</span>
          </button>`).join('')
      : `<p class="py-8 text-center text-xs text-ink/40">No pieces match “${escapeHTML(term)}”.</p>`;
  }

  /* ---------------------------------------------------------
     Event wiring
     --------------------------------------------------------- */
  function wireEvents() {
    /* global click delegation */
    document.addEventListener('click', (e) => {
      const add = e.target.closest('[data-add]');
      if (add) {
        e.preventDefault();
        e.stopPropagation();
        addToCart(add.dataset.add, 1);
        return;
      }

      const wish = e.target.closest('[data-wish]');
      if (wish) {
        e.preventDefault();
        e.stopPropagation();
        toggleWishlist(wish.dataset.wish);
        return;
      }

      const product = e.target.closest('[data-product]');
      if (product) {
        openProduct(product.dataset.product);
        return;
      }

      const qtyBtn = e.target.closest('[data-cart-qty]');
      if (qtyBtn) {
        updateCartQty(qtyBtn.dataset.cartQty, Number(qtyBtn.dataset.delta));
        return;
      }

      const remove = e.target.closest('[data-cart-remove]');
      if (remove) {
        removeFromCart(remove.dataset.cartRemove);
        return;
      }

      if (e.target.closest('[data-open-cart]')) { openCart(); return; }
      if (e.target.closest('[data-close-cart]')) { closeCart(); return; }
      const filterLink = e.target.closest('[data-filter-link]');
      if (filterLink) {
        setFilter(filterLink.dataset.filterLink);
        closeMobile();
        return;
      }

      if (e.target.closest('[data-open-wishlist]')) { closeMobile(); openWishlist(); return; }
      if (e.target.closest('[data-close-wishlist]')) { closeWishlist(); return; }
      if (e.target.closest('[data-open-auth]')) { openAuth('signin'); return; }
      if (e.target.closest('[data-close-auth]')) { closeAuth(); return; }
      if (e.target.closest('[data-open-account]')) { closeMobile(); openAccount(); return; }
      if (e.target.closest('[data-close-account]')) { closeAccount(); return; }
      if (e.target.closest('[data-open-mobile]')) { openMobile(); return; }
      if (e.target.closest('[data-close-mobile]')) { closeMobile(); return; }
      if (e.target.closest('[data-open-search]')) { openSearch(); return; }
      if (e.target.closest('[data-close-search]')) { closeSearch(); return; }
      if (e.target.closest('[data-close-product]')) { closeProduct(); return; }
      if (e.target.closest('[data-close-checkout]')) { closeCheckout(); return; }

      const searchProduct = e.target.closest('[data-search-product]');
      if (searchProduct) {
        closeSearch();
        openProduct(searchProduct.dataset.searchProduct);
        return;
      }
    });

    $('#checkout-modal').addEventListener('click', (e) => {
      if (e.target.closest('[data-close-checkout]')) closeCheckout();
    });

    /* product modal quantity */
    document.addEventListener('click', (e) => {
      const qty = e.target.closest('[data-modal-qty]');
      if (qty) {
        const p = state.modalProduct;
        if (!p) return;
        state.modalQty = Math.max(1, Math.min(p.stock, state.modalQty + Number(qty.dataset.modalQty)));
        const qtyEl = $('#modal-qty');
        const totalEl = $('#modal-total');
        if (qtyEl) qtyEl.textContent = state.modalQty;
        if (totalEl) totalEl.textContent = money(p.price * state.modalQty);
      }

      const modalAdd = e.target.closest('[data-modal-add]');
      if (modalAdd) {
        addToCart(modalAdd.dataset.modalAdd, state.modalQty);
        closeProduct();
        openCart();
      }
    });

    /* auth */
    $('#auth-form').addEventListener('submit', handleAuthSubmit);
    $$('[data-auth-tab]').forEach((tab) => {
      tab.addEventListener('click', () => setAuthTab(tab.dataset.authTab));
    });
    $('#auth-forgot').addEventListener('click', () => {
      toast('Password reset is not available in this demo — create a new account or use any password you remember.', '!');
    });

    /* account tabs delegated */
    $('#account-body').addEventListener('click', (e) => {
      const tab = e.target.closest('[data-account-tab]');
      if (tab) {
        state.accountTab = tab.dataset.accountTab;
        renderAccount();
        return;
      }
      if (e.target.closest('[data-signout]')) {
        state.sessionEmail = null;
        store.remove(STORAGE.session);
        closeAccount();
        toast('You have been signed out', '✦');
        return;
      }
      const reorder = e.target.closest('[data-reorder]');
      if (reorder) {
        const user = currentUser();
        const order = user.orders.find((o) => o.id === reorder.dataset.reorder);
        if (order) {
          order.items.forEach((item) => addToCart(item.id, item.qty, true));
          persistCart();
          closeAccount();
          openCart();
          toast('Order added back to your bag', '✦');
        }
      }
    });

    $('#account-body').addEventListener('submit', (e) => {
      if (e.target.id !== 'profile-form') return;
      e.preventDefault();
      const user = currentUser();
      if (!user) return;
      const name = $('#profile-name').value.trim();
      if (name.length < 2) { toast('Please enter your full name', '!'); return; }
      user.name = name;
      user.phone = $('#profile-phone').value.trim();
      user.address = {
        street: $('#profile-address').value.trim(),
        city: $('#profile-city').value.trim(),
        region: $('#profile-region').value
      };
      state.users[user.email] = user;
      persistUsers();
      renderAccount();
      toast('Profile updated', '✦');
    });

    /* cart promo + checkout */
    $('#promo-apply').addEventListener('click', () => {
      const code = $('#promo-input').value.trim().toUpperCase();
      const note = $('#promo-note');
      if (!code) return;
      if (PROMOS[code]) {
        state.promo = code;
        store.set(STORAGE.promo, code);
        renderCart();
        if (!$('#checkout-modal').classList.contains('hidden')) renderCheckoutSummary();
        toast(`Promo ${code} applied — ${Math.round(PROMOS[code] * 100)}% off`, '✦');
      } else {
        note.textContent = 'That code is not valid. Try LAYEMI10.';
        note.className = 'mb-3 text-[11px] text-wine';
        note.classList.remove('hidden');
      }
    });
    $('#promo-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); $('#promo-apply').click(); }
    });
    $('#checkout-btn').addEventListener('click', openCheckout);
    $('#wishlist-add-all').addEventListener('click', () => {
      const items = state.wishlist.map(byId).filter(Boolean);
      items.forEach((p) => addToCart(p.id, 1, true));
      persistCart();
      closeWishlist();
      openCart();
      toast(`${items.length} ${items.length === 1 ? 'piece' : 'pieces'} added to your bag`, '✦');
    });

    /* search */
    $('#search-input').addEventListener('input', (e) => {
      state.search = e.target.value;
      renderGrid();
    });
    $('#sort-select').addEventListener('change', (e) => {
      state.sort = e.target.value;
      renderGrid();
    });
    $('#overlay-search').addEventListener('input', (e) => renderSearchResults(e.target.value));
    $('#reset-filters').addEventListener('click', () => {
      state.search = '';
      state.filter = 'all';
      $('#search-input').value = '';
      setFilter('all');
    });

    /* filters */
    $$('#filter-bar .filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => setFilter(chip.dataset.filter));
    });

    /* newsletter */
    $('#newsletter-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = e.target.querySelector('input');
      if (!input.value.trim()) return;
      e.target.reset();
      toast('You are on the list. Welcome to the inner circle.', '✦');
    });

    /* escape key */
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('#checkout-modal').classList.contains('hidden')) return closeCheckout();
      if (!$('#auth-modal').classList.contains('hidden')) return closeAuth();
      if (!$('#account-modal').classList.contains('hidden')) return closeAccount();
      if (!$('#product-modal').classList.contains('hidden')) return closeProduct();
      if (!$('#search-overlay').classList.contains('hidden')) return closeSearch();
      if (!$('#wishlist-drawer').classList.contains('hidden')) return closeWishlist();
      if (!$('#cart-drawer').classList.contains('hidden')) return closeCart();
      if (!$('#mobile-menu').classList.contains('hidden')) return closeMobile();
    });

    /* close checkout escape via button */
    $('#close-checkout').addEventListener('click', closeCheckout);

    /* header shadow + scroll top */
    window.addEventListener('scroll', () => {
      $('#site-header').classList.toggle('scrolled', window.scrollY > 20);
      const btn = $('#scroll-top');
      const show = window.scrollY > 600;
      btn.classList.toggle('opacity-0', !show);
      btn.classList.toggle('translate-y-3', !show);
      btn.classList.toggle('pointer-events-none', !show);
    }, { passive: true });
    $('#scroll-top').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    /* count updating on storage across tabs */
    window.addEventListener('storage', (e) => {
      if (!e.key) return;
      if (e.key === STORAGE.cart) {
        state.cart = store.get(STORAGE.cart, []);
        updateBadges();
        renderCart();
      }
    });
  }

  /* ---------------------------------------------------------
     Boot
     --------------------------------------------------------- */
  function init() {
    $('#year').textContent = new Date().getFullYear();
    updateBadges();
    renderGrid();
    renderCart();
    renderWishlist();
    wireEvents();

    /* reveal on scroll */
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12 });
      $$('.reveal').forEach((el) => observer.observe(el));
    } else {
      $$('.reveal').forEach((el) => el.classList.add('in'));
    }

    /* Drop a returning user straight back into their session */
    if (state.sessionEmail && !state.users[state.sessionEmail]) {
      state.sessionEmail = null;
      store.remove(STORAGE.session);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
