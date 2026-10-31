#!/usr/bin/env python3
"""Set up an existing Directus instance as backend for the gdxlabs.com site.

News are not created here: Breakdown publishes them to the collections posts and
content_blocks (site_key "gdxlabs"). This script adds the rules for them.

Creates (idempotently, safe to run again):
  * collection gdxlabs_newsletter_subscribers  - sign-ups from the newsletter form
  * collection gdxlabs_contact_messages        - messages from the contact form
  * public permissions: read published posts of site gdxlabs and their
    content blocks, create subscribers and contact messages (but not read them)
  * role/policy "GDX Labs Redaktion"           - read this site's posts, manage subscribers and messages
  * optionally an editor user, an e-mail notification for new contact
    messages, and js/gdx-directus-config.js for the static site

Works with Directus 10 (role based permissions) and 11+ (policies). The site rules
need a license on Directus 12 (core tier refuses item rules); --without-custom-rules
sets up the subscriber and message collections without them and leaves posts private.
Only uses the Python standard library.

Example:
  DIRECTUS_TOKEN=<admin static token> python3 tools/directus_setup.py \\
      --url https://cms.example.com --write-config js/gdx-directus-config.js \\
      --editor-email redaktion@gdxlabs.com --editor-password '...' \\
      --notify-email office@gdxlabs.com
"""
import argparse, json, mimetypes, os, sys, uuid
import urllib.error, urllib.parse, urllib.request

SITE_KEY = "gdxlabs"  # siteKey of the GdxLabs destination in Breakdown (config/directus-destinations.json)
SUBSCRIBERS = "gdxlabs_newsletter_subscribers"
MESSAGES = "gdxlabs_contact_messages"
NOTIFY_FLOW = "GDX Labs: Benachrichtigung Kontaktformular"
EDITOR = "GDX Labs Redaktion"
EMAIL_REGEX = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
PUBLIC_POST_FIELDS = ["id", "site_key", "status", "title", "slug", "excerpt", "publish_at", "language", "source_date"]
PUBLIC_BLOCK_FIELDS = ["id", "post_id", "sort", "type", "layout", "text", "url", "file", "alt_text", "caption"]
PUBLIC_FILE_FIELDS = ["id", "type", "title", "filename_download", "width", "height", "filesize"]
SUBSCRIBE_FIELDS = ["name", "email", "source"]
MESSAGE_FIELDS_PUBLIC = ["name", "email", "subject", "message", "source"]


class Directus:
    def __init__(self, url, token):
        self.url, self.token = url.rstrip("/"), token

    def request(self, method, path, body=None, headers=None, raw=None):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        h = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        if raw is None and body is not None:
            h["Content-Type"] = "application/json"
        h.update(headers or {})
        req = urllib.request.Request(self.url + path, data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(req) as r:
                text = r.read().decode()
                return json.loads(text).get("data") if text else None
        except urllib.error.HTTPError as e:
            raise DirectusError(e.code, method, path, e.read().decode(errors="replace")) from None

    def get(self, path, **params):
        query = urllib.parse.urlencode({k: json.dumps(v) if isinstance(v, (dict, list)) else v for k, v in params.items()})
        return self.request("GET", path + ("?" + query if query else ""))

    def post(self, path, body):
        return self.request("POST", path, body)

    def patch(self, path, body):
        return self.request("PATCH", path, body)

    def login(self, email, password):
        self.token = None
        self.token = self.post("/auth/login", {"email": email, "password": password})["access_token"]

    def upload(self, file_path, folder, title):
        boundary = uuid.uuid4().hex
        parts = []
        for name, value in (("folder", folder), ("title", title)):
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
        mime = mimetypes.guess_type(file_path)[0] or "application/octet-stream"
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{os.path.basename(file_path)}"\r\n'
                     f"Content-Type: {mime}\r\n\r\n".encode() + open(file_path, "rb").read() + b"\r\n")
        parts.append(f"--{boundary}--\r\n".encode())
        return self.request("POST", "/files", raw=b"".join(parts),
                            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})


class DirectusError(Exception):
    def __init__(self, status, method, path, body):
        super().__init__(f"{method} {path} -> HTTP {status}: {body[:500]}")
        self.status = status
        self.body = body


def log(msg):
    print(msg, flush=True)


# --- schema -----------------------------------------------------------------

def pk_field():
    return {"field": "id", "type": "integer", "meta": {"hidden": True, "readonly": True, "interface": "input"},
            "schema": {"is_primary_key": True, "has_auto_increment": True}}


def choice(text, value, color):
    return {"text": text, "value": value, "color": color}


SUBSCRIBER_FIELDS = [
    {"field": "email", "type": "string", "schema": {"is_nullable": False, "is_unique": True},
     "meta": {"interface": "input", "required": True, "width": "half", "sort": 2,
              "validation": {"_and": [{"email": {"_regex": EMAIL_REGEX}}]},
              "validation_message": "Bitte eine gültige E-Mail-Adresse angeben"}},
    {"field": "name", "type": "string", "schema": {},
     "meta": {"interface": "input", "width": "half", "sort": 3}},
    {"field": "status", "type": "string", "schema": {"default_value": "subscribed", "is_nullable": False},
     "meta": {"interface": "select-dropdown", "display": "labels", "width": "half", "sort": 4,
              "options": {"choices": [choice("Angemeldet", "subscribed", "#2ECDA7"), choice("Abgemeldet", "unsubscribed", "#A2B5CD")]},
              "display_options": {"choices": [choice("Angemeldet", "subscribed", "#2ECDA7"), choice("Abgemeldet", "unsubscribed", "#A2B5CD")]}}},
    {"field": "source", "type": "string", "schema": {},
     "meta": {"interface": "input", "readonly": True, "width": "half", "sort": 5, "note": "Seite, auf der das Formular abgeschickt wurde"}},
    {"field": "date_created", "type": "timestamp", "schema": {},
     "meta": {"special": ["date-created"], "interface": "datetime", "display": "datetime", "readonly": True, "width": "half", "sort": 6}},
]


MESSAGE_FIELDS = [
    {"field": "status", "type": "string", "schema": {"default_value": "new", "is_nullable": False},
     "meta": {"interface": "select-dropdown", "display": "labels", "width": "half", "sort": 2,
              "options": {"choices": [choice("Neu", "new", "#E35169"), choice("Beantwortet", "answered", "#2ECDA7"),
                                      choice("Archiviert", "archived", "#A2B5CD")]},
              "display_options": {"choices": [choice("Neu", "new", "#E35169"), choice("Beantwortet", "answered", "#2ECDA7"),
                                              choice("Archiviert", "archived", "#A2B5CD")]}}},
    {"field": "date_created", "type": "timestamp", "schema": {},
     "meta": {"special": ["date-created"], "interface": "datetime", "display": "datetime", "readonly": True, "width": "half", "sort": 3}},
    {"field": "name", "type": "string", "schema": {"is_nullable": False},
     "meta": {"interface": "input", "required": True, "readonly": True, "width": "half", "sort": 4}},
    {"field": "email", "type": "string", "schema": {"is_nullable": False},
     "meta": {"interface": "input", "required": True, "readonly": True, "width": "half", "sort": 5,
              "validation": {"_and": [{"email": {"_regex": EMAIL_REGEX}}]},
              "validation_message": "Bitte eine gültige E-Mail-Adresse angeben"}},
    {"field": "subject", "type": "string", "schema": {},
     "meta": {"interface": "input", "readonly": True, "width": "full", "sort": 6}},
    {"field": "message", "type": "text", "schema": {"is_nullable": False},
     "meta": {"interface": "input-multiline", "required": True, "readonly": True, "width": "full", "sort": 7}},
    {"field": "source", "type": "string", "schema": {},
     "meta": {"interface": "input", "readonly": True, "width": "half", "sort": 8, "note": "Seite, auf der das Formular abgeschickt wurde"}},
    {"field": "notes", "type": "text", "schema": {},
     "meta": {"interface": "input-multiline", "width": "full", "sort": 9, "note": "Interne Notizen der Redaktion"}},
]


def ensure_collection(api, name, meta, fields):
    existing = {c["collection"] for c in api.get("/collections")}
    if name not in existing:
        api.post("/collections", {"collection": name, "meta": meta, "schema": {}, "fields": [pk_field()]})
        log(f"+ collection {name}")
    else:
        log(f"= collection {name}")
    have = {f["field"]: f for f in api.get(f"/fields/{name}")}
    for field in fields:
        current = have.get(field["field"])
        if not current:
            api.post(f"/fields/{name}", field)
            log(f"  + field {field['field']}")
            continue
        want = field["schema"].get("default_value")
        if want is not None and (current.get("schema") or {}).get("default_value") != want:
            api.patch(f"/fields/{name}/{field['field']}", {"schema": {"default_value": want}})
            log(f"  ~ field {field['field']} (Standardwert {want})")


# --- access control -----------------------------------------------------------

class Access:
    """Permission targets: a policy (Directus 11) or a role (Directus 10)."""

    def __init__(self, api, custom_rules=True):
        self.api = api
        # item rules and presets need a license on Directus 12 (not on the core tier)
        self.custom_rules = custom_rules
        try:
            api.get("/policies", limit=1)
            self.v11 = True
        except DirectusError as e:
            if e.status not in (403, 404):
                raise
            self.v11 = False
        log(f"Directus {'11+ (policies)' if self.v11 else '10 (roles)'} erkannt")

    def public(self):
        if not self.v11:
            return None  # role = null is the public role in Directus 10
        rows = self.api.get("/access", filter={"_and": [{"role": {"_null": True}}, {"user": {"_null": True}}]}, fields="policy")
        if not rows:
            sys.exit("Keine Public-Policy gefunden (directus_access ohne Rolle/User)")
        return rows[0]["policy"]

    def editor(self):
        roles = self.api.get("/roles", filter={"name": {"_eq": EDITOR}}, fields="id")
        role = roles[0]["id"] if roles else None
        if not self.v11:
            if not role:
                role = self.api.post("/roles", {"name": EDITOR, "icon": "edit_note", "app_access": True, "admin_access": False})["id"]
                log(f"+ role {EDITOR}")
            return role, role
        policies = self.api.get("/policies", filter={"name": {"_eq": EDITOR}}, fields="id")
        policy = policies[0]["id"] if policies else None
        if not policy:
            policy = self.api.post("/policies", {"name": EDITOR, "icon": "edit_note", "app_access": True, "admin_access": False})["id"]
            log(f"+ policy {EDITOR}")
        if not role:
            role = self.api.post("/roles", {"name": EDITOR, "icon": "edit_note"})["id"]
            log(f"+ role {EDITOR}")
        if not self.api.get("/access", filter={"_and": [{"role": {"_eq": role}}, {"policy": {"_eq": policy}}]}, fields="id"):
            self.api.post("/access", {"role": role, "policy": policy})
        return role, policy

    def grant(self, label, target, collection, action, fields=("*",), permissions=None, presets=None):
        key = "policy" if self.v11 else "role"
        match = {"_null": True} if target is None else {"_eq": target}
        # unlicensed Directus 12 refuses any field list other than "*" as a custom rule
        body = {"collection": collection, "action": action, "fields": list(fields) if self.custom_rules else ["*"]}
        # without custom rules the rule keys must be absent: Directus 12 rejects even null rules
        if self.custom_rules:
            body.update({"permissions": permissions or None, "validation": None, "presets": presets or None})
        existing = self.api.get("/permissions", fields="id", filter={
            "_and": [{"collection": {"_eq": collection}}, {"action": {"_eq": action}}, {key: match}]})
        if existing:
            self.api.patch(f"/permissions/{existing[0]['id']}", body)
        else:
            self.api.post("/permissions", dict(body, **{key: target}))
        log(f"  {'~' if existing else '+'} {label}: {action} {collection}")


def ensure_block_file_link(api):
    """Breakdown imports images into directus_files and references them from content_blocks.file.
    The reverse alias on directus_files lets the public rule follow that link: only files used by
    published posts of this site become readable."""
    if "content_blocks" not in {c["collection"] for c in api.get("/collections")}:
        log("  ! content_blocks fehlt: Bilder-Freigabe übersprungen")
        return
    files = {f["field"] for f in api.get("/fields/directus_files")}
    if "content_blocks" not in files:
        api.post("/fields/directus_files", {"field": "content_blocks", "type": "alias",
                                            "meta": {"special": ["o2m"], "interface": "list-o2m", "hidden": True}})
        log("  + field directus_files.content_blocks (Rückverweis)")
    rels = api.get("/relations/content_blocks") or []
    if not any(r["field"] == "file" for r in rels):
        api.post("/relations", {"collection": "content_blocks", "field": "file", "related_collection": "directus_files",
                                "meta": {"one_field": "content_blocks"}, "schema": {"on_delete": "SET NULL"}})
        log("  + relation content_blocks.file -> directus_files")


def setup_permissions(api, access):
    public = access.public()
    log("Public-Zugriff:")
    site_posts = {"_and": [{"site_key": {"_eq": SITE_KEY}}, {"status": {"_eq": "published"}}]}
    if access.custom_rules:
        # Breakdown writes every site's posts into these collections; the rules limit reads to this site
        access.grant("public", public, "posts", "read", PUBLIC_POST_FIELDS, permissions=site_posts)
        access.grant("public", public, "content_blocks", "read", PUBLIC_BLOCK_FIELDS,
                     permissions={"post_id": site_posts})
        # only images that published posts of this site use. Directus 11 ignores the rule when both
        # conditions sit in one _some, so they are split: used by a block of this site, and by a published post
        access.grant("public", public, "directus_files", "read", PUBLIC_FILE_FIELDS,
                     permissions={"_and": [
                         {"content_blocks": {"_some": {"post_id": {"site_key": {"_eq": SITE_KEY}}}}},
                         {"content_blocks": {"_some": {"post_id": {"status": {"_eq": "published"}}}}}]})
    else:
        log("  - posts und content_blocks nicht öffentlich: ohne Lizenz ließe sich nicht auf diese Site beschränken")
        log("  ! ohne eigene Regeln: Entwürfe sind über die API lesbar, alle Dateien der Instanz öffentlich")
    access.grant("public", public, SUBSCRIBERS, "create", SUBSCRIBE_FIELDS, presets={"status": "subscribed"})
    access.grant("public", public, MESSAGES, "create", MESSAGE_FIELDS_PUBLIC, presets={"status": "new"})
    role, editor = access.editor()
    log(f"{EDITOR}:")
    for action in ("read", "update", "delete"):
        access.grant("editor", editor, SUBSCRIBERS, action)
        access.grant("editor", editor, MESSAGES, action)
    if access.custom_rules:
        access.grant("editor", editor, "posts", "read", permissions=site_posts)
        access.grant("editor", editor, "content_blocks", "read", permissions={"post_id": site_posts})
    return role


def ensure_editor_user(api, role, email, password):
    users = api.get("/users", filter={"email": {"_eq": email}}, fields="id")
    if users:
        api.patch(f"/users/{users[0]['id']}", {"role": role})
        log(f"= user {email} (Rolle gesetzt)")
    else:
        api.post("/users", {"email": email, "password": password, "role": role, "status": "active"})
        log(f"+ user {email}")


def ensure_notification(api, recipients):
    """Flow that mails every new contact message to the given addresses."""
    flows = api.get("/flows", filter={"name": {"_eq": NOTIFY_FLOW}}, fields="id,operation")
    flow = flows[0] if flows else api.post("/flows", {
        "name": NOTIFY_FLOW, "icon": "mail", "status": "active", "trigger": "event", "accountability": "all",
        "options": {"type": "action", "scope": ["items.create"], "collections": [MESSAGES]}})
    mail = {"to": recipients, "type": "markdown", "subject": "Neue Nachricht über gdxlabs.com: {{$trigger.payload.subject}}",
            "body": "**Von:** {{$trigger.payload.name}} ({{$trigger.payload.email}})\n\n"
                    "**Betreff:** {{$trigger.payload.subject}}\n\n{{$trigger.payload.message}}"}
    if flow.get("operation"):
        api.patch(f"/operations/{flow['operation']}", {"options": mail})
        log(f"= flow {NOTIFY_FLOW} (Empfänger: {', '.join(recipients)})")
    else:
        op = api.post("/operations", {"flow": flow["id"], "key": "mail", "name": "E-Mail senden", "type": "mail",
                                      "position_x": 19, "position_y": 1, "options": mail})
        api.patch(f"/flows/{flow['id']}", {"operation": op["id"]})
        log(f"+ flow {NOTIFY_FLOW} (Empfänger: {', '.join(recipients)})")


# --- checks / output -------------------------------------------------------------

def check_cors(url, origins):
    for origin in origins:
        req = urllib.request.Request(f"{url}/items/{SUBSCRIBERS}", method="OPTIONS", headers={
            "Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
        try:
            with urllib.request.urlopen(req) as r:
                allowed = r.headers.get("Access-Control-Allow-Origin")
        except urllib.error.HTTPError as e:
            allowed = e.headers.get("Access-Control-Allow-Origin")
        except urllib.error.URLError:
            allowed = None
        if allowed in (origin, "*"):
            log(f"CORS ok für {origin}")
        else:
            log(f"! CORS: {origin} ist nicht freigegeben. In der Directus-Umgebung setzen:\n"
                f"    CORS_ENABLED=true\n    CORS_ORIGIN={','.join(origins)}\n  und Directus neu starten.")
            return


def write_config(path, url):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write("/* Generated by tools/directus_setup.py (--write-config). */\n"
                "window.GDX_DIRECTUS = " + json.dumps({"url": url, "siteKey": SITE_KEY, "subscribers": SUBSCRIBERS, "messages": MESSAGES}, indent=2) + ";\n")
    log(f"Frontend-Konfiguration geschrieben: {path}")


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--url", default=os.environ.get("DIRECTUS_URL"), help="Directus base URL (or DIRECTUS_URL)")
    p.add_argument("--token", default=os.environ.get("DIRECTUS_TOKEN"), help="admin static token (or DIRECTUS_TOKEN)")
    p.add_argument("--email", default=os.environ.get("DIRECTUS_EMAIL"), help="admin login instead of a token")
    p.add_argument("--password", default=os.environ.get("DIRECTUS_PASSWORD"))
    p.add_argument("--editor-email", help="create/update a user with the editor role")
    p.add_argument("--editor-password", default=os.environ.get("DIRECTUS_EDITOR_PASSWORD"))
    p.add_argument("--notify-email", action="append", default=[], metavar="ADDRESS",
                   help="mail new contact messages to this address (repeatable; needs EMAIL_* set up in Directus)")
    p.add_argument("--write-config", metavar="PATH", help="write the frontend config (js/gdx-directus-config.js)")
    p.add_argument("--origin", action="append", default=[], help="site origin to check CORS for (repeatable)")
    p.add_argument("--without-custom-rules", action="store_true",
                   help="for unlicensed Directus 12 (core tier): no item rules, so drafts become readable "
                        "through the API and all files public")
    a = p.parse_args()
    if not a.url or not (a.token or (a.email and a.password)):
        p.error("--url und --token (oder --email/--password) werden benötigt")
    if a.editor_email and not a.editor_password:
        p.error("--editor-email braucht --editor-password (oder DIRECTUS_EDITOR_PASSWORD)")

    api = Directus(a.url, a.token)
    if not a.token:
        api.login(a.email, a.password)
    if not api.get("/users/me", fields="role.admin_access,admin_access"):
        sys.exit("Login fehlgeschlagen")

    if not a.without_custom_rules:
        ensure_block_file_link(api)
    ensure_collection(api, SUBSCRIBERS, {"icon": "mark_email_read", "note": "Newsletter-Anmeldungen von gdxlabs.com",
                                         "display_template": "{{email}}"}, SUBSCRIBER_FIELDS)
    ensure_collection(api, MESSAGES, {"icon": "contact_mail", "note": "Nachrichten aus dem Kontaktformular von gdxlabs.com",
                                      "display_template": "{{name}}: {{subject}}", "sort_field": None,
                                      "archive_field": "status", "archive_value": "archived", "unarchive_value": "new"},
                      MESSAGE_FIELDS)
    try:
        role = setup_permissions(api, Access(api, custom_rules=not a.without_custom_rules))
    except DirectusError as e:
        if "custom_permission_rules_enabled" not in e.body:
            raise
        sys.exit("Diese Directus-Instanz erlaubt ohne Lizenz keine eigenen Berechtigungsregeln.\n"
                 "Entweder eine Lizenz eintragen (kostenlos über https://directus.com/oig) und erneut starten,\n"
                 "oder mit --without-custom-rules starten (Entwürfe dann über die API lesbar, alle Dateien öffentlich).")
    if a.editor_email:
        ensure_editor_user(api, role, a.editor_email, a.editor_password)
    if a.notify_email:
        ensure_notification(api, a.notify_email)
    if a.write_config:
        write_config(a.write_config, api.url)
    check_cors(api.url, a.origin or ["https://www.gdxlabs.com", "https://gdxlabs.com"])
    log("Fertig.")


if __name__ == "__main__":
    main()
