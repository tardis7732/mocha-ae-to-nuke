/* Mocha AE -> Nuke CornerPin2D / Transform. Run via File > Scripts.
   Uses public AE keyframes; no Mocha binaries are modified.
   Library mode for tests: set $.global.MOCHA_NUKE_LIBRARY_ONLY = true. */
var MochaNukeBridge = (function () {
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
    function clipboardPermissionMessage() {
        try {
            if (app.preferences.getPrefAsLong('Main Pref Section v2', 'Pref_SCRIPTING_FILE_NETWORK_SECURITY') === 0)
                return 'AE에서 클립보드 복사에 필요한 스크립팅 권한이 꺼져 있습니다.\n이 창을 닫고 편집 > 환경 설정 > 스크립팅 및 표현식에서\n[스크립트를 통한 파일 쓰기 및 네트워크 액세스 허용]을 켠 뒤 다시 실행하세요.';
        } catch (ignored) {}
        return '';
    }
    function copyClipboard(text, progress) {
        var permissionMessage = clipboardPermissionMessage();
        if (permissionMessage) throw new Error(permissionMessage);
        if (typeof text !== 'string' || text.length < 20 || text.indexOf('# Mocha AE') !== 0)
            throw new Error('복사할 트래킹 데이터가 비어 있거나 올바르지 않습니다.');
        var powershell = new File($.getenv('SystemRoot') + '/System32/WindowsPowerShell/v1.0/powershell.exe');
        if (!powershell.exists) throw new Error('Windows PowerShell을 찾을 수 없습니다. Windows에서 실행하세요.');
        var token = new Date().getTime() + '_' + Math.floor(Math.random() * 1000000000);
        var payload = new File(Folder.temp.fsName + '/MochaNuke_' + token + '.txt');
        if (payload.exists) throw new Error('임시 파일 이름이 겹쳤습니다. 다시 복사하세요.');
        var temporaryFiles = [payload];
        var encoded = encodeUTF16(text), bytes = text.length * 2;
        function psString(value) { return "'" + String(value).replace(/'/g, "''") + "'"; }
        function temporaryFile(suffix) {
            var file = new File(Folder.temp.fsName + '/MochaNuke_' + token + suffix);
            if (file.exists) throw new Error('임시 파일 이름이 겹쳤습니다. 다시 복사하세요.');
            temporaryFiles.push(file);
            return file;
        }
        function writeChecked(file, value) {
            file.encoding = 'UTF-8';
            if (!file.open('w')) throw new Error('임시 데이터를 쓸 수 없습니다: ' + file.error);
            var written = file.write(value), closed = file.close();
            if (!written || !closed) throw new Error('임시 데이터 쓰기에 실패했습니다.');
            if (!file.open('r')) throw new Error('임시 데이터를 다시 읽을 수 없습니다.');
            var actual = file.read(); file.close();
            if (actual !== value) throw new Error('임시 데이터가 원본과 다릅니다. 복사를 중단했습니다.');
        }
        function request(stage) {
            var expected = 'MOCHA_' + stage + ':' + token + ':' + bytes;
            var worker = temporaryFile('_' + stage + '.worker.txt');
            var result = temporaryFile('_' + stage + '.result.txt');
            // Base64 keeps the payload independent of AE's text encoding and newline conversion.
            // Validate the original byte count before touching the clipboard. Use a fresh process for VERIFY.
            var code = "$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'; try {" +
                '$encoded=[IO.File]::ReadAllText(' + psString(payload.fsName) + ');' +
                'if($encoded.Length -ne ' + encoded.length + "){throw 'Encoded data length mismatch.'};" +
                '$bytes=[Convert]::FromBase64String($encoded);' +
                'if($bytes.Length -ne ' + bytes + " -or $bytes.Length -eq 0){throw 'Tracking data length mismatch.'};" +
                '$value=[Text.Encoding]::Unicode.GetString($bytes);' +
                "if(-not $value.StartsWith('# Mocha AE') -or $value.IndexOf([char]0) -ge 0){throw 'Invalid tracking data.'};" +
                'Add-Type -AssemblyName System.Windows.Forms;' +
                (stage === 'COPY' ? '[System.Windows.Forms.Clipboard]::SetDataObject($value,$true,20,50);' : '') +
                '$matched=$false; for($i=0;$i -lt 20;$i++) {' +
                'try {$got=[System.Windows.Forms.Clipboard]::GetText();' +
                'if([String]::Equals($got,$value,[StringComparison]::Ordinal)){$matched=$true;break}} catch {};' +
                'Start-Sleep -Milliseconds 50};' +
                "if(-not $matched){throw 'Clipboard content does not match tracking data.'};" +
                '$reply=' + psString(expected) + ';' +
                "} catch {$reply='ERROR: '+$_.Exception.Message};" +
                '[IO.File]::WriteAllText(' + psString(result.fsName) + ',$reply,[Text.Encoding]::UTF8);';
            writeChecked(worker, code);
            // AE may return empty stdout for PowerShell. Keep the command short, run through
            // cmd.exe, and require a fresh, stage-specific result file rather than stdout.
            var loader = '& ([ScriptBlock]::Create([IO.File]::ReadAllText(' + psString(worker.fsName) + ')))';
            var command = 'cmd.exe /d /s /c ""' + powershell.fsName + '" -NoLogo -NoProfile -NonInteractive -STA -WindowStyle Hidden -EncodedCommand ' + encodeUTF16(loader) + ' 2>&1"';
            var output = system.callSystem(command), reply = '';
            if (result.exists) {
                result.encoding = 'UTF-8';
                if (!result.open('r')) throw new Error('임시 데이터를 다시 읽을 수 없습니다.');
                reply = result.read(); result.close();
            }
            reply = String(reply).replace(/^[\s\uFEFF]+|[\s\uFEFF]+$/g, '');
            // Console output is diagnostic only: it cannot establish successful copying.
            if (reply !== expected) throw new Error('클립보드 ' + stage + ': ' + (reply || String(output || '').replace(/^\s+|\s+$/g, '') || 'Windows 복사 명령의 응답이 없습니다.'));
        }
        try {
            writeChecked(payload, encoded);
            if (progress) progress(1, 3);
            request('COPY');
            if (progress) progress(2, 3);
            request('VERIFY');
            if (progress) progress(3, 3);
        } finally {
            for (var i = 0; i < temporaryFiles.length; i++) {
                try { temporaryFiles[i].close(); } catch (ignored) {}
                try { if (temporaryFiles[i].exists) temporaryFiles[i].remove(); } catch (ignored2) {}
            }
        }
    }
    function run() {
        try {
            var comp = app.project ? app.project.activeItem : null;
            if (!(comp instanceof CompItem) || comp.selectedLayers.length !== 1)
                throw new Error('컴포지션에서 Mocha 트래킹이 적용된 레이어 하나를 선택하세요.');
            var layer = comp.selectedLayers[0], effects = findPins(layer);
            validateLayer(layer, comp);
            var fd = comp.frameDuration;
            var start = Math.ceil(Math.max(0, layer.inPoint, comp.workAreaStart) / fd - 0.00001);
            var end = Math.ceil(Math.min(comp.duration, layer.outPoint, comp.workAreaStart + comp.workAreaDuration) / fd - 0.00001) - 1;
            var win = new Window('dialog', 'Mocha AE → Nuke | v1.0');
            win.orientation = 'column'; win.alignChildren = 'fill'; win.spacing = 12; win.margins = 16;
            var header = win.add('group'); header.orientation = 'column'; header.alignChildren = 'left'; header.spacing = 4;
            header.add('statictext', undefined, '선택 레이어: ' + layer.name);
            header.add('statictext', undefined, '컴포지션  ' + comp.width + ' × ' + comp.height + '  ·  ' + number(comp.frameRate) + ' fps');
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
            var exportPanel = panel('내보내기 설정');
            var typeList = dropdown(exportPanel, '노드 종류', ['CornerPin2D', 'Transform']);
            typeList.selection = effects.length ? 0 : 1;
            var names = []; for (var i = 0; i < effects.length; i++) names.push(effects[i].name + ' #' + effects[i].propertyIndex);
            if (!names.length) names.push('Corner Pin 효과 없음');
            var cornerOptions = exportPanel.add('group'); cornerOptions.orientation = 'column'; cornerOptions.alignChildren = 'fill'; cornerOptions.spacing = 8;
            var effectList = dropdown(cornerOptions, 'Corner Pin 효과', names); effectList.selection = 0;
            var cornerSpaceList = dropdown(cornerOptions, '코너 좌표', ['Mocha 좌표 그대로', '레이어 변환 포함']);
            cornerSpaceList.selection = 0;
            var modeHelp = exportPanel.add('statictext', undefined, '', {multiline: true}); modeHelp.preferredSize = [540, 38];
            var framePanel = panel('프레임 설정');
            function field(row, label, value) {
                var cell = row.add('group'); cell.orientation = 'row'; cell.preferredSize.width = 260;
                var caption = cell.add('statictext', undefined, label); caption.preferredSize.width = 122;
                var edit = cell.add('edittext', undefined, String(value)); edit.characters = 7; return edit;
            }
            var rangeRow = framePanel.add('group'); rangeRow.orientation = 'row'; rangeRow.spacing = 16;
            var firstBox = field(rangeRow, 'AE 시작 프레임', start), lastBox = field(rangeRow, 'AE 끝 프레임', end);
            var referenceRow = framePanel.add('group'); referenceRow.orientation = 'row'; referenceRow.spacing = 16;
            var nukeBox = field(referenceRow, 'Nuke 시작 프레임', 1);
            var refBox = field(referenceRow, '레퍼런스 프레임', 0);
            var frameHelp = framePanel.add('statictext', undefined,
                'AE 프레임은 컴포지션 시작을 0으로 셉니다. 끝 프레임도 포함됩니다.\n레퍼런스도 AE 기준이며, 내보낼 시작~끝 범위 안에서 지정하세요.', {multiline: true});
            frameHelp.preferredSize = [540, 38];
            function updateModeHelp() {
                var isTransform = typeList.selection.index === 1;
                modeHelp.text = isTransform ? '레이어의 위치·회전·크기를 읽어 Transform 하나로 만듭니다.\n지정한 레퍼런스 프레임 대비 움직임을 적용합니다.' :
                    (cornerSpaceList.selection.index === 1 ? '코너 좌표에 AE 레이어의 위치·회전·크기를 함께 적용합니다.' :
                    'Mocha 코너 좌표를 사용합니다. Null에 받은 트래킹에 적합합니다.') + '\n레퍼런스 프레임의 사각형을 기준으로 CornerPin2D 하나를 만듭니다.';
            }
            typeList.onChange = function () {
                var isTransform = typeList.selection.index === 1;
                // Keep both rows in the layout so switching node types never shifts the frame controls.
                cornerOptions.enabled = !isTransform;
                updateModeHelp();
            };
            cornerSpaceList.onChange = updateModeHelp;
            var copyPanel = panel('복사');
            var pasteHelp = copyPanel.add('statictext', undefined,
                '복사 전에 레퍼런스 프레임이 원하는 기준 시점인지 확인하세요.\n입력 이미지의 해상도는 AE 컴포지션과 맞춰 주세요.', {multiline: true});
            pasteHelp.preferredSize = [540, 38];
            var status = copyPanel.add('statictext', undefined, clipboardPermissionMessage() || '준비 완료 · 복사 후 Nuke 노드 그래프에서 Ctrl+V 하세요.', {multiline: true});
            status.preferredSize = [540, 64];
            var buttons = copyPanel.add('group'); buttons.alignment = 'right';
            var exportButton = buttons.add('button', undefined, '클립보드로 복사');
            win.defaultElement = exportButton;
            exportButton.onClick = function () {
                exportButton.enabled = false;
                try {
                    status.text = '트래킹 데이터를 복사하는 중입니다…';
                    win.update();
                    var opts = {aeFirst: integer(firstBox.text, 'AE start'), aeLast: integer(lastBox.text, 'AE end'),
                        type: typeList.selection.index === 1 ? 'transform' : 'cornerpin',
                        cornerSpace: cornerSpaceList.selection.index === 1 ? 'layer' : 'comp',
                        nukeFirst: integer(nukeBox.text, 'Nuke start'), reference: true,
                        refFrame: integer(refBox.text, '레퍼런스 프레임')};
                    if (opts.type === 'cornerpin' && !effects.length) throw new Error('Mocha AE에서 Corner Pin > Apply Export를 먼저 실행하세요.');
                    var data = collect(layer, effects[effectList.selection.index], comp, opts);
                    copyClipboard(makeNK(data), function (done, total) {
                        status.text = '클립보드로 전달 중… ' + Math.round(done / total * 100) + '%';
                    });
                    status.text = '복사 완료 · Nuke ' + data.first + '–' + (data.first + data.samples.length - 1) + '프레임 · 노드 1개';
                    status.text += '\n레퍼런스: AE ' + opts.refFrame + ' → Nuke ' + (data.first + data.refIndex) + '\nNuke 노드 그래프에서 Ctrl+V 하세요.';
                } catch (e) { status.text = '복사 실패: ' + (e.message || e.toString()); }
                finally { exportButton.enabled = true; }
            };
            typeList.onChange();
            win.center(); win.show();
        } catch (e) { alert('Mocha → Nuke\n' + e.toString()); }
    }
    return {run: run, collect: collect, makeNK: makeNK, sample: sample, transformPoint: transformPoint,
        findPins: findPins, encodeUTF16: encodeUTF16, copyClipboard: copyClipboard,
        relativeTransforms: relativeTransforms};
}());
if (!$.global.MOCHA_NUKE_LIBRARY_ONLY) MochaNukeBridge.run();
