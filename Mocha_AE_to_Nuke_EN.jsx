/* Mocha AE -> Nuke CornerPin2D / Transform. Run via File > Scripts.
   Uses public AE keyframes; no Mocha binaries are modified.
   Library mode for tests: set $.global.MOCHA_NUKE_LIBRARY_ONLY = true. */
var MochaNukeBridge = (function () {
    var bridgeScriptPath = $.fileName || '';
    function number(v) {
        if (typeof v !== 'number' || !isFinite(v)) throw new Error('Invalid numeric tracking value.');
        return String(Math.round(v * 1000000) / 1000000);
    }
    function integer(s, title) {
        if (!/^-?\d+$/.test(String(s))) throw new Error(title + ': enter an integer.');
        var v = Number(s);
        if (Math.abs(v) > 10000000) throw new Error(title + ': frame is out of range.');
        return v;
    }
    function transformPoint(p, anchor, position, scale, rotation, height) {
        var x = (p[0] - anchor[0]) * scale[0] / 100;
        var y = (p[1] - anchor[1]) * scale[1] / 100;
        var r = rotation * Math.PI / 180;
        return [position[0] + x * Math.cos(r) - y * Math.sin(r),
                height - (position[1] + x * Math.sin(r) + y * Math.cos(r))];
    }
    function findPins(layer) {
        var effects = layer.property('ADBE Effect Parade'), found = [];
        if (effects) for (var i = 1; i <= effects.numProperties; i++) {
            if (effects.property(i).matchName === 'ADBE Corner Pin') found.push(effects.property(i));
        }
        return found;
    }
    function validateLayer(layer, comp) {
        if (layer.threeDLayer || layer.parent || layer.autoOrient !== AutoOrientType.NO_AUTO_ORIENT)
            throw new Error('Use a 2D layer with no parent and Auto-Orient off.');
        if (layer.source && Math.abs(layer.source.pixelAspect - comp.pixelAspect) > 0.000001)
            throw new Error('Layer and composition pixel aspect ratios must match. Use a comp-size solid.');
    }
    function readTransform(layer, time) {
        var tr = layer.property('ADBE Transform Group');
        var a = tr.property('ADBE Anchor Point').valueAtTime(time, false);
        var posProp = tr.property('ADBE Position');
        var p = posProp.dimensionsSeparated ?
            [posProp.getSeparationFollower(0).valueAtTime(time, false), posProp.getSeparationFollower(1).valueAtTime(time, false)] :
            posProp.valueAtTime(time, false);
        var s = tr.property('ADBE Scale').valueAtTime(time, false);
        var r = tr.property('ADBE Rotate Z').valueAtTime(time, false);
        return {anchor: a, position: p, scale: s, rotation: r};
    }
    function sample(layer, effect, comp, time, cornerSpace) {
        // Mocha's exported points already describe the tracked image coordinates.
        // A receiving Null's default Position must not be added a second time.
        var t = cornerSpace === 'layer' ? readTransform(layer, time) : null;
        // AE UL, UR, LL, LR -> Nuke LL, LR, UR, UL.
        var order = [3, 4, 2, 1], result = [];
        for (var i = 0; i < 4; i++) {
            var point = effect.property(order[i]).valueAtTime(time, false);
            result.push(t ? transformPoint(point, t.anchor, t.position, t.scale, t.rotation, comp.height) :
                [point[0], comp.height - point[1]]);
        }
        return result;
    }
    function makeNK(data) {
        if (data.type === 'transform') return makeTransformNK(data);
        var lines = ['# Mocha AE to Nuke - sampled public AE Corner Pin data',
            '# Comp ' + data.width + 'x' + data.height + ' pixel_aspect ' + number(data.par) + ' fps ' + number(data.fps),
            '# First exported AE comp-relative frame ' + data.aeFirst + ' -> Nuke ' + data.first,
            '# Corner coordinates: ' + (data.cornerSpace === 'layer' ? 'layer-to-comp' : 'Mocha image / comp'),
            'CornerPin2D {', ' inputs 0'];
        for (var p = 0; p < 4; p++) {
            var curves = [];
            for (var axis = 0; axis < 2; axis++) {
                var keys = ['curve'];
                for (var f = 0; f < data.samples.length; f++) {
                    keys.push('L x' + (data.first + f) + ' ' + number(data.samples[f][p][axis]));
                }
                curves.push('{' + keys.join(' ') + '}');
            }
            lines.push(' to' + (p + 1) + ' {' + curves.join(' ') + '}');
            lines.push(' from' + (p + 1) + ' {' + number(data.from[p][0]) + ' ' + number(data.from[p][1]) + '}');
        }
        lines.push(' name MochaAE_CornerPin');
        lines.push(' label "Mocha AE | ' + data.width + 'x' + data.height + ' | ' + number(data.fps) + ' fps\\nFrames ' + data.first + '-' + (data.first + data.samples.length - 1) + ' | ' + data.mode + '"');
        lines.push('}', '');
        return lines.join('\n');
    }
    function collect(layer, effect, comp, opts) {
        validateLayer(layer, comp);
        var first = opts.aeFirst, last = opts.aeLast, fd = comp.frameDuration;
        if (first > last) throw new Error('Export range is empty.');
        if (first < 0 || last >= Math.ceil(comp.duration / fd - 0.00001)) throw new Error('Range is outside the composition.');
        if (first * fd < layer.inPoint - 0.00001 || last * fd >= layer.outPoint - 0.00001)
            throw new Error('Range must be inside the selected layer in/out points.');
        if (opts.reference && (opts.refFrame < first || opts.refFrame > last)) throw new Error('Reference frame must be inside the export range.');
        var samples = [];
        for (var f = first; f <= last; f++) {
            if (opts.type === 'transform') {
                var tr = readTransform(layer, f * fd);
                samples.push({translate: [tr.position[0] - tr.anchor[0], tr.anchor[1] - tr.position[1]],
                    rotate: -tr.rotation, scale: [tr.scale[0] / 100, tr.scale[1] / 100],
                    center: [tr.anchor[0], comp.height - tr.anchor[1]]});
            } else samples.push(sample(layer, effect, comp, f * fd, opts.cornerSpace));
        }
        if (opts.type === 'transform' && opts.reference) {
            var ref = samples[opts.refFrame - first];
            if (Math.abs(ref.scale[0]) < 0.00000001 || Math.abs(ref.scale[1]) < 0.00000001)
                throw new Error('Reference scale cannot be zero.');
        }
        var from = opts.reference ? samples[opts.refFrame - first] :
            [[0, 0], [comp.width, 0], [comp.width, comp.height], [0, comp.height]];
        return {type: opts.type || 'cornerpin', cornerSpace: opts.cornerSpace || 'comp', reference: opts.reference, refIndex: opts.refFrame - first,
            width: comp.width, height: comp.height, fps: comp.frameRate, par: comp.pixelAspect,
            aeFirst: first, first: opts.nukeFirst, from: from, samples: samples,
            mode: opts.reference ? 'reference ' + (opts.nukeFirst + opts.refFrame - first) :
                (opts.type === 'transform' ? 'AE layer transform' : 'full-frame insert')};
    }
    function relativeTransforms(data) {
        var ref = data.samples[data.refIndex], out = [];
        var rr = ref.rotate * Math.PI / 180, rc = Math.cos(rr), rs = Math.sin(rr);
        var pivot = [ref.center[0] + ref.translate[0], ref.center[1] + ref.translate[1]];
        var previousAngle = null, previousSourceAngle = null;
        for (var f = 0; f < data.samples.length; f++) {
            var t = data.samples[f], r = t.rotate * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
            // B = R(t) S(t) inverse(S(ref)) inverse(R(ref)).
            var rx = t.scale[0] / ref.scale[0], ry = t.scale[1] / ref.scale[1];
            var a = c * rx * rc + s * ry * rs, b = c * rx * rs - s * ry * rc;
            var d = s * rx * rc - c * ry * rs, e = s * rx * rs + c * ry * rc;
            var sx = Math.sqrt(a * a + d * d), det = a * e - b * d;
            if (sx < 1e-10 || Math.abs(det) < 1e-10)
                throw new Error('Transform scale is zero or too small at Nuke frame ' + (data.first + f) + '.');
            // Nuke: rotate * skewX * scale. Keep signed Y scale for reflections.
            var angle = Math.atan2(d, a) * 180 / Math.PI;
            var targetAngle = previousAngle === null ? t.rotate - ref.rotate : previousAngle + t.rotate - previousSourceAngle;
            angle += 360 * Math.round((targetAngle - angle) / 360);
            previousAngle = angle; previousSourceAngle = t.rotate;
            var dx = (ref.center[0] - t.center[0]) * t.scale[0];
            var dy = (ref.center[1] - t.center[1]) * t.scale[1];
            out.push({translate: [t.center[0] + t.translate[0] + c * dx - s * dy - pivot[0],
                t.center[1] + t.translate[1] + s * dx + c * dy - pivot[1]],
                rotate: angle, scale: [sx, det / sx], skewX: (a * b + d * e) / det, center: pivot});
        }
        return out;
    }
    function makeTransformNK(data) {
        var lines = ['# Mocha AE to Nuke Transform',
            '# Comp ' + data.width + 'x' + data.height + ' pixel_aspect ' + number(data.par) + ' fps ' + number(data.fps),
            '# AE comp-relative frame ' + data.aeFirst + ' -> Nuke ' + data.first];
        var samples = data.reference ? relativeTransforms(data) : data.samples;
        var fields = data.reference ? ['translate', 'rotate', 'scale', 'skewX', 'center'] : ['translate', 'rotate', 'scale', 'center'];
        lines.push('Transform {', ' inputs 0');
        if (data.reference) lines.push(' skewY 0', ' skew_order XY');
        for (var i = 0; i < fields.length; i++) {
            var field = fields[i], dims = (field === 'rotate' || field === 'skewX') ? 1 : 2, curves = [];
            for (var axis = 0; axis < dims; axis++) {
                var keys = ['curve'];
                for (var f = 0; f < data.samples.length; f++) {
                    var val = dims === 1 ? samples[f][field] : samples[f][field][axis];
                    keys.push('L x' + (data.first + f) + ' ' + number(val));
                }
                curves.push('{' + keys.join(' ') + '}');
            }
            lines.push(' ' + field + ' {' + curves.join(' ') + '}');
        }
        lines.push(' name MochaAE_Transform',
            ' label "Mocha AE Transform | ' + data.width + 'x' + data.height + ' | ' + number(data.fps) + ' fps\\nFrames ' + data.first + '-' + (data.first + data.samples.length - 1) + ' | ' + data.mode + '"',
            ' xpos 0', ' ypos 0', '}', '');
        return lines.join('\n');
    }
    function encodeUTF16(text) {
        var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', bytes = [], result = '';
        for (var i = 0; i < text.length; i++) { var c = text.charCodeAt(i); bytes.push(c & 255, c >> 8); }
        for (var j = 0; j < bytes.length; j += 3) {
            var a = bytes[j], b = j + 1 < bytes.length ? bytes[j + 1] : 0, c2 = j + 2 < bytes.length ? bytes[j + 2] : 0;
            result += alphabet.charAt(a >> 2) + alphabet.charAt(((a & 3) << 4) | (b >> 4)) +
                (j + 1 < bytes.length ? alphabet.charAt(((b & 15) << 2) | (c2 >> 6)) : '=') +
                (j + 2 < bytes.length ? alphabet.charAt(c2 & 63) : '=');
        }
        return result;
    }
    function helperCommand(helperPath, args) {
        return '"' + helperPath + '" ' + args.join(' ');
    }
    function clipboardPermissionMessage() {
        try {
            if (app.preferences.getPrefAsLong('Main Pref Section v2', 'Pref_SCRIPTING_FILE_NETWORK_SECURITY') === 0)
                return 'AE is blocking the clipboard helper.\nClose this dialog and open Preferences > Scripting & Expressions.\nEnable Allow Scripts to Write Files and Access Network, then run again.';
        } catch (ignored) {}
        return '';
    }
    function copyClipboard(text, progress) {
        var permissionMessage = clipboardPermissionMessage();
        if (permissionMessage) throw new Error(permissionMessage);
        if (typeof text !== 'string' || text.length < 20 || text.indexOf('# Mocha AE') !== 0)
            throw new Error('Tracking data is empty or invalid.');
        var helper = new File(new File(bridgeScriptPath).parent.fsName + '/MochaClipboard.exe');
        if (!helper.exists) throw new Error('MochaClipboard.exe is missing. Keep it in the same folder as the JSX script.');
        var token = new Date().getTime() + '_' + Math.floor(Math.random() * 1000000000);
        function request(args, expected) {
            var reply = system.callSystem(helperCommand(helper.fsName, args));
            reply = String(reply).replace(/^\s+|\s+$/g, '');
            if (reply !== expected) throw new Error('Clipboard ' + args[0] + ': ' + (reply || 'No response from the clipboard helper.'));
        }
        try {
            request(['begin', token], 'READY');
            for (var start = 0; start < text.length; start += 1600) {
                var chunk = text.substring(start, Math.min(start + 1600, text.length));
                request(['append', token, String(start * 2), encodeUTF16(chunk)], 'APPENDED:' + ((start + chunk.length) * 2));
                if (progress) progress(Math.min(start + chunk.length, text.length), text.length);
            }
            var bytes = String(text.length * 2);
            request(['copy', token, bytes], 'COPIED:' + bytes);
            request(['verify', token, bytes], 'VERIFIED:' + bytes);
        } finally {
            try { system.callSystem(helperCommand(helper.fsName, ['cleanup', token])); } catch (ignored) {}
        }
    }
    function run() {
        try {
            var comp = app.project ? app.project.activeItem : null;
            if (!(comp instanceof CompItem) || comp.selectedLayers.length !== 1)
                throw new Error('Select one layer with applied Mocha tracking data in the composition.');
            var layer = comp.selectedLayers[0], effects = findPins(layer);
            validateLayer(layer, comp);
            var fd = comp.frameDuration;
            var start = Math.ceil(Math.max(0, layer.inPoint, comp.workAreaStart) / fd - 0.00001);
            var end = Math.ceil(Math.min(comp.duration, layer.outPoint, comp.workAreaStart + comp.workAreaDuration) / fd - 0.00001) - 1;
            var win = new Window('dialog', 'Mocha AE → Nuke | v1.0');
            win.orientation = 'column'; win.alignChildren = 'fill'; win.spacing = 12; win.margins = 16;
            var header = win.add('group'); header.orientation = 'column'; header.alignChildren = 'left'; header.spacing = 4;
            header.add('statictext', undefined, 'Selected layer: ' + layer.name);
            header.add('statictext', undefined, 'Composition  ' + comp.width + ' × ' + comp.height + '  ·  ' + number(comp.frameRate) + ' fps');
            function panel(title) {
                var p = win.add('panel', undefined, title);
                p.orientation = 'column'; p.alignChildren = 'fill'; p.spacing = 10; p.margins = [14, 20, 14, 14];
                return p;
            }
            function dropdown(parent, label, items) {
                var row = parent.add('group'); row.orientation = 'row'; row.alignChildren = ['left', 'center'];
                var caption = row.add('statictext', undefined, label); caption.preferredSize.width = 90;
                var list = row.add('dropdownlist', undefined, items); list.alignment = ['fill', 'center'];
                return list;
            }
            var exportPanel = panel('Export settings');
            var typeList = dropdown(exportPanel, 'Node type', ['CornerPin2D', 'Transform']);
            typeList.selection = effects.length ? 0 : 1;
            var names = []; for (var i = 0; i < effects.length; i++) names.push(effects[i].name + ' #' + effects[i].propertyIndex);
            if (!names.length) names.push('No Corner Pin effect');
            var cornerOptions = exportPanel.add('group'); cornerOptions.orientation = 'column'; cornerOptions.alignChildren = 'fill'; cornerOptions.spacing = 8;
            var effectList = dropdown(cornerOptions, 'Corner Pin effect', names); effectList.selection = 0;
            var cornerSpaceList = dropdown(cornerOptions, 'Coordinates', ['Mocha coordinates', 'Include layer transform']);
            cornerSpaceList.selection = 0;
            var modeHelp = exportPanel.add('statictext', undefined, '', {multiline: true}); modeHelp.preferredSize = [540, 38];
            var framePanel = panel('Frame settings');
            function field(row, label, value) {
                var cell = row.add('group'); cell.orientation = 'row'; cell.preferredSize.width = 260;
                var caption = cell.add('statictext', undefined, label); caption.preferredSize.width = 122;
                var edit = cell.add('edittext', undefined, String(value)); edit.characters = 7; return edit;
            }
            var rangeRow = framePanel.add('group'); rangeRow.orientation = 'row'; rangeRow.spacing = 16;
            var firstBox = field(rangeRow, 'AE start frame', start), lastBox = field(rangeRow, 'AE end frame', end);
            var referenceRow = framePanel.add('group'); referenceRow.orientation = 'row'; referenceRow.spacing = 16;
            var nukeBox = field(referenceRow, 'Nuke start frame', 1);
            var refBox = field(referenceRow, 'Reference frame', 0);
            var frameHelp = framePanel.add('statictext', undefined,
                'AE frames count from 0 at the start of the composition. The end frame is included.\nThe reference uses AE frame numbers and must be within the export range.', {multiline: true});
            frameHelp.preferredSize = [540, 38];
            function updateModeHelp() {
                var isTransform = typeList.selection.index === 1;
                modeHelp.text = isTransform ? 'Reads layer position, rotation and scale into one Transform.\nApplies motion relative to the specified reference frame.' :
                    (cornerSpaceList.selection.index === 1 ? 'Applies AE layer position, rotation and scale to the corner coordinates.' :
                    'Uses Mocha corner coordinates. Suitable for tracking applied to a Null.') + '\nCreates one CornerPin2D using the reference-frame corners as its source.';
            }
            typeList.onChange = function () {
                var isTransform = typeList.selection.index === 1;
                // Keep both rows in the layout so switching node types never shifts the frame controls.
                cornerOptions.enabled = !isTransform;
                updateModeHelp();
            };
            cornerSpaceList.onChange = updateModeHelp;
            var copyPanel = panel('Copy');
            var pasteHelp = copyPanel.add('statictext', undefined,
                'Before copying, check that the reference frame is the one you intended.\nMatch the input image resolution to the AE composition.', {multiline: true});
            pasteHelp.preferredSize = [540, 38];
            var status = copyPanel.add('statictext', undefined, clipboardPermissionMessage() || 'Ready · After copying, press Ctrl+V in the Nuke node graph.', {multiline: true});
            status.preferredSize = [540, 64];
            var buttons = copyPanel.add('group'); buttons.alignment = 'right';
            var exportButton = buttons.add('button', undefined, 'Copy to clipboard');
            win.defaultElement = exportButton;
            exportButton.onClick = function () {
                exportButton.enabled = false;
                try {
                    status.text = 'Preparing tracking data…';
                    win.update();
                    var opts = {aeFirst: integer(firstBox.text, 'AE start'), aeLast: integer(lastBox.text, 'AE end'),
                        type: typeList.selection.index === 1 ? 'transform' : 'cornerpin',
                        cornerSpace: cornerSpaceList.selection.index === 1 ? 'layer' : 'comp',
                        nukeFirst: integer(nukeBox.text, 'Nuke start'), reference: true,
                        refFrame: integer(refBox.text, 'Reference frame')};
                    if (opts.type === 'cornerpin' && !effects.length) throw new Error('First apply Corner Pin tracking data using Apply Export in Mocha AE.');
                    var data = collect(layer, effects[effectList.selection.index], comp, opts);
                    copyClipboard(makeNK(data), function (done, total) {
                        status.text = 'Copying to clipboard… ' + Math.round(done / total * 100) + '%';
                    });
                    status.text = 'Copied · Nuke ' + data.first + '–' + (data.first + data.samples.length - 1) + ' frames · 1 node';
                    status.text += '\nReference: AE ' + opts.refFrame + ' → Nuke ' + (data.first + data.refIndex) + '\nPress Ctrl+V in the Nuke node graph.';
                } catch (e) { status.text = 'Copy failed: ' + (e.message || e.toString()); }
                finally { exportButton.enabled = true; }
            };
            typeList.onChange();
            win.center(); win.show();
        } catch (e) { alert('Mocha → Nuke\n' + e.toString()); }
    }
    return {run: run, collect: collect, makeNK: makeNK, sample: sample, transformPoint: transformPoint,
        findPins: findPins, helperCommand: helperCommand, encodeUTF16: encodeUTF16, copyClipboard: copyClipboard,
        relativeTransforms: relativeTransforms};
}());
if (!$.global.MOCHA_NUKE_LIBRARY_ONLY) MochaNukeBridge.run();
