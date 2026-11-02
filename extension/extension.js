import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

function readMainPath(extensionPath) {
    const file = Gio.File.new_for_path(`${extensionPath}/helper.json`);
    const [, bytes] = file.load_contents(null);
    return JSON.parse(new globalThis.TextDecoder().decode(bytes)).main;
}

function run(mainPath, args, done) {
    const nodeBin = GLib.find_program_in_path('node') ?? `${GLib.get_home_dir()}/.asdf/shims/node`;
    const proc = Gio.Subprocess.new(
        [nodeBin, mainPath, ...args],
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
    proc.communicate_utf8_async(null, null, (p, res) => {
        try {
            const [, out, err] = p.communicate_utf8_finish(res);
            if (p.get_successful())
                done(out);
            else
                done(null, (err || '').trim().split('\n').pop() || `exit ${p.get_exit_status()}`);
        } catch (e) {
            globalThis.logError(e, 'timeglass');
            done(null, e.message);
        }
    });
}

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(mainPath, iconPath) {
        super._init(0.0, 'timeglass');
        this._main = mainPath;
        const box = new St.BoxLayout({style_class: 'panel-status-menu-box'});
        box.add_child(new St.Icon({gicon: Gio.icon_new_for_string(iconPath), style_class: 'system-status-icon'}));
        this._label = new St.Label({text: '—', y_align: Clutter.ActorAlign.CENTER});
        box.add_child(this._label);
        this.add_child(box);

        this._blocks = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._blocks);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const refresh = new PopupMenu.PopupMenuItem('Refresh');
        refresh.connect('activate', () => this._refresh());
        this.menu.addMenuItem(refresh);
        this._addItem = new PopupMenu.PopupMenuItem('+ Add account');
        this._addItem.connect('activate', () => this._addAccountDialog());
        this.menu.addMenuItem(this._addItem);

        this.menu.connect('open-state-changed', (_m, open) => open && this._reload());
        this._reload();
    }

    _refresh() {
        this._label.text = '…';
        run(this._main, ['refresh'], (_out, err) => {
            if (!this._destroyed)
                this._reload(err ? `Refresh failed: ${err}` : null);
        });
    }

    _addAccountDialog() {
        this.menu.close();
        const dialog = new ModalDialog.ModalDialog({styleClass: 'prompt-dialog'});
        this._dialog = dialog;
        dialog.connect('closed', () => {
            if (this._dialog === dialog)
                this._dialog = null;
            dialog.destroy();
        });
        const box = new St.BoxLayout({vertical: true, style: 'spacing: 8px;'});
        const nameEntry = new St.Entry({hint_text: 'Account name', can_focus: true});
        const status = new St.Label({text: ''});
        [new St.Label({text: 'Add Claude account'}), nameEntry, status]
            .forEach(w => box.add_child(w));
        dialog.contentLayout.add_child(box);
        dialog.addButton({label: 'Cancel', key: Clutter.KEY_Escape, action: () => dialog.close()});
        dialog.addButton({
            label: 'Add and log in',
            default: true,
            action: () => {
                const name = nameEntry.text.trim();
                if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) {
                    status.text = 'Use 1-64 letters, digits, dot, dash or underscore';
                    return;
                }
                dialog.close();
                this._runAdd(name);
            },
        });
        dialog.open();
        nameEntry.grab_key_focus();
    }

    _runAdd(name) {
        this._addItem.setSensitive(false);
        this._label.text = '…';
        const finish = failure => {
            this._addItem.setSensitive(true);
            if (failure)
                Main.notify('timeglass', failure);
            this._reload(failure);
        };
        run(this._main, ['add', name], (_out, err) => {
            if (this._destroyed)
                return;
            if (err)
                return finish(`Add account failed: ${err}`);
            run(this._main, ['refresh'], (_o, refreshErr) => {
                if (!this._destroyed)
                    finish(refreshErr ? `Refresh failed: ${refreshErr}` : null);
            });
        });
    }

    _addAccountRow(account) {
        const item = new PopupMenu.PopupBaseMenuItem({reactive: false});
        const text = new St.Label({text: account.text, style: 'font-family: monospace;'});
        const edit = new St.Button({label: '✎', can_focus: true, y_align: Clutter.ActorAlign.START});
        item.add_child(text);
        item.add_child(edit);
        edit.connect('clicked', () => this._editLabel(item, text, edit, account));
        this._blocks.addMenuItem(item);
    }

    _editLabel(item, text, edit, account) {
        const entry = new St.Entry({text: account.label, can_focus: true, x_expand: true});
        item.replace_child(text, entry);
        edit.hide();
        entry.clutter_text.connect('activate', () => {
            const label = entry.text.trim();
            run(this._main, ['label', account.name, label], (_out, err) => {
                if (!this._destroyed)
                    this._reload(err ? `Rename failed: ${err}` : null);
            });
        });
        entry.clutter_text.connect('key-press-event', (_a, event) => {
            if (event.get_key_symbol() !== Clutter.KEY_Escape)
                return Clutter.EVENT_PROPAGATE;
            this._reload();
            return Clutter.EVENT_STOP;
        });
        entry.grab_key_focus();
    }

    destroy() {
        this._destroyed = true;
        this._dialog?.close();
        super.destroy();
    }

    _reload(failure = null) {
        run(this._main, ['model'], out => {
            if (this._destroyed)
                return;
            this._blocks.removeAll();
            if (failure)
                this._blocks.addMenuItem(new PopupMenu.PopupMenuItem(`✗ ${failure}`, {reactive: false}));
            if (!out) {
                this._label.text = '—';
                this._blocks.addMenuItem(new PopupMenu.PopupMenuItem('timeglass failed (is node on PATH?)', {reactive: false}));
                return;
            }
            const model = JSON.parse(out);
            this._label.text = model.bar;
            this._blocks.addMenuItem(new PopupMenu.PopupMenuItem(model.activeLine, {reactive: false}));
            if (model.recommended)
                this._blocks.addMenuItem(new PopupMenu.PopupMenuItem(`switch to: ${model.recommended}`, {reactive: false}));
            if (model.accounts.length === 0)
                this._blocks.addMenuItem(new PopupMenu.PopupMenuItem('No data yet: press Refresh', {reactive: false}));
            model.accounts.forEach(a => this._addAccountRow(a));
        });
    }
});

export default class TimeglassExtension extends Extension {
    enable() {
        this._indicator = new Indicator(readMainPath(this.path), `${this.path}/icons/timeglass-symbolic.svg`);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
