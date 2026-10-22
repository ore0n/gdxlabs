/* News feed (/news/), newsletter sign-up and contact form backed by Directus.
   Collections and permissions are created by tools/directus_setup.py,
   the URL comes from js/gdx-directus-config.js. */
(function () {
  'use strict';

  var cfg = window.GDX_DIRECTUS;
  if (!cfg || !cfg.url) return;
  var API = cfg.url.replace(/\/$/, '');
  var PAGE_SIZE = 10;
  var LIST_FIELDS = 'id,slug,title,summary,cover_image,date_published';

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('de-AT', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function asset(id, width, height) {
    return API + '/assets/' + encodeURIComponent(id) + '?width=' + width + (height ? '&height=' + height + '&fit=cover' : '');
  }

  function getItems(params) {
    var query = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    return fetch(API + '/items/' + cfg.news + '?' + query).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (body) { return body.data; });
  }

  function postUrl(item) {
    return '?post=' + encodeURIComponent(item.slug || item.id);
  }

  /* ---- news ---- */

  function renderCard(item) {
    var img = item.cover_image
      ? '<a class="gdx-news-cover" href="' + postUrl(item) + '"><img loading="lazy" alt="" src="' + asset(item.cover_image, 640, 360) + '"></a>'
      : '';
    return '<article class="gdx-news-item">' + img +
      '<div class="gdx-news-text">' +
      '<time class="gdx-news-date">' + escapeHtml(formatDate(item.date_published)) + '</time>' +
      '<h2 class="gdx-news-title"><a href="' + postUrl(item) + '">' + escapeHtml(item.title) + '</a></h2>' +
      (item.summary ? '<p class="gdx-news-summary">' + escapeHtml(item.summary) + '</p>' : '') +
      '<a class="gdx-news-more" href="' + postUrl(item) + '">Weiterlesen</a>' +
      '</div></article>';
  }

  function showList(root) {
    var offset = 0;
    root.innerHTML = '<div class="gdx-news-list"></div><p class="gdx-news-status">News werden geladen …</p>' +
      '<button type="button" class="gdx-news-load" hidden>Mehr laden</button>';
    var list = root.querySelector('.gdx-news-list');
    var status = root.querySelector('.gdx-news-status');
    var button = root.querySelector('.gdx-news-load');

    function load() {
      button.disabled = true;
      // one item more than shown tells whether another page exists
      getItems({ fields: LIST_FIELDS, sort: '-date_published,-id', limit: PAGE_SIZE + 1, offset: offset })
        .then(function (items) {
          list.insertAdjacentHTML('beforeend', items.slice(0, PAGE_SIZE).map(renderCard).join(''));
          status.textContent = 'Noch keine News vorhanden.';
          status.hidden = offset > 0 || items.length > 0;
          offset += PAGE_SIZE;
          button.hidden = items.length <= PAGE_SIZE;
          button.disabled = false;
        })
        .catch(function () {
          status.textContent = 'Die News konnten gerade nicht geladen werden.';
          status.hidden = false;
          button.disabled = false;
        });
    }
    button.addEventListener('click', load);
    load();
  }

  function showPost(root, key) {
    root.innerHTML = '<p class="gdx-news-status">Beitrag wird geladen …</p>';
    var filter = /^\d+$/.test(key)
      ? { _or: [{ slug: { _eq: key } }, { id: { _eq: Number(key) } }] }
      : { slug: { _eq: key } };
    getItems({ fields: LIST_FIELDS + ',content', filter: JSON.stringify(filter), limit: 1 })
      .then(function (items) {
        var item = items[0];
        if (!item) {
          root.innerHTML = '<p class="gdx-news-status">Diesen Beitrag gibt es nicht (mehr).</p>' +
            '<a class="gdx-news-back" href="./">&larr; Alle News</a>';
          return;
        }
        var heading = document.querySelector('.single-title');
        if (heading) heading.textContent = item.title;
        var crumb = document.querySelector('.cactus-breadcrumb .current');
        if (crumb) crumb.innerHTML = '<a href="./">News</a> &rsaquo; ' + escapeHtml(item.title);
        document.title = item.title + ' – GdxLabs';
        // content is HTML written by editors in Directus
        root.innerHTML = '<article class="gdx-news-post">' +
          '<time class="gdx-news-date">' + escapeHtml(formatDate(item.date_published)) + '</time>' +
          (item.cover_image ? '<img class="gdx-news-post-cover" alt="" src="' + asset(item.cover_image, 1280) + '">' : '') +
          '<div class="gdx-news-content">' + (item.content || '') + '</div>' +
          '<a class="gdx-news-back" href="./">&larr; Alle News</a></article>';
      })
      .catch(function () {
        root.innerHTML = '<p class="gdx-news-status">Der Beitrag konnte gerade nicht geladen werden.</p>';
      });
  }

  var newsRoot = document.getElementById('gdx-news');
  if (newsRoot) {
    var key = new URLSearchParams(location.search).get('post');
    if (key) showPost(newsRoot, key); else showList(newsRoot);
  }

  /* ---- forms (Contact Form 7 markup, Directus instead of WordPress) ---- */

  var FORMS = {
    // newsletter in the sidebar
    '482': {
      collection: cfg.subscribers,
      fields: { name: 'your-name', email: 'your-email' },
      required: ['name', 'email'],
      // an address that is already on the list gets the same answer as a new one
      duplicateOk: true,
      invalid: 'Bitte Name und eine gültige E-Mail-Adresse angeben.',
      success: 'Danke! Du bist für unseren Newsletter angemeldet.',
      failure: 'Die Anmeldung hat leider nicht geklappt. Bitte versuch es später noch einmal.'
    },
    // contact page
    '212': {
      collection: cfg.messages || 'gdxlabs_contact_messages',
      fields: { name: 'your-name', email: 'your-email', subject: 'your-subject', message: 'your-message' },
      required: ['name', 'email', 'message'],
      duplicateOk: false,
      invalid: 'Bitte Name, eine gültige E-Mail-Adresse und eine Nachricht angeben.',
      success: 'Danke für deine Nachricht! Wir melden uns so bald wie möglich.',
      failure: 'Die Nachricht konnte leider nicht gesendet werden. Bitte versuch es später noch einmal.'
    }
  };

  function respond(form, ok, message) {
    var out = form.querySelector('.wpcf7-response-output');
    if (!out) return;
    out.className = 'wpcf7-response-output ' + (ok ? 'wpcf7-mail-sent-ok' : 'wpcf7-validation-errors');
    out.setAttribute('role', ok ? 'status' : 'alert');
    out.textContent = message;
  }

  // capture phase: runs before Contact Form 7's own handler, which needs WordPress
  document.addEventListener('submit', function (event) {
    var form = event.target;
    var marker = form.querySelector('input[name="_wpcf7"]');
    var spec = marker && FORMS[marker.value];
    if (!spec) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    var data = { source: location.pathname };
    Object.keys(spec.fields).forEach(function (key) {
      var input = form.querySelector('[name="' + spec.fields[key] + '"]');
      data[key] = input ? input.value.trim() : '';
    });
    var complete = spec.required.every(function (key) { return data[key]; });
    if (!complete || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) {
      respond(form, false, spec.invalid);
      return;
    }
    var submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;

    fetch(API + '/items/' + spec.collection, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(function (r) {
        if (r.ok) return true;
        return r.json().then(function (body) {
          var code = body && body.errors && body.errors[0] && body.errors[0].extensions && body.errors[0].extensions.code;
          if (spec.duplicateOk && code === 'RECORD_NOT_UNIQUE') return true;
          throw new Error(code || 'HTTP ' + r.status);
        });
      })
      .then(function () {
        form.reset();
        respond(form, true, spec.success);
      })
      .catch(function () {
        respond(form, false, spec.failure);
      })
      .then(function () {
        if (submit) submit.disabled = false;
      });
  }, true);
})();
