#!/usr/bin/env python3
"""Apply the small, version-checked Paradise integration to the pinned upstream."""
import json, os, pathlib, subprocess
root = pathlib.Path(__file__).resolve().parent.parent
up = pathlib.Path(os.environ.get('PARADISE_UPSTREAM_DIR', root.parent / 'upstream/vscode'))
lock = json.loads((root/'upstream.json').read_text())
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=up,text=True).strip() == lock['commit']

changes = {}
def original(name):
    return subprocess.check_output(['git','show','HEAD:'+name],cwd=up,text=True)

def edit(name, old, new):
    s=changes.get(name, original(name))
    if new and new in s: return
    if old not in s: raise RuntimeError(f'Upstream patch no longer applies: {name}')
    changes[name]=s.replace(old,new,1)

p=up/'product.json'
product=json.loads(original('product.json'))
product.update(nameShort='Paradise Code',nameLong='Paradise Code',applicationName='paradise-code',
    dataFolderName='.paradise-code',serverApplicationName='paradise-server',
    serverDataFolderName='.paradise-server',urlProtocol='paradise-code',
    darwinBundleIdentifier='dev.paradise.code',
    reportIssueUrl='https://github.com/alimortazavi-pr/paradise-code/issues',
    enableTelemetry=False, enableExperiments=False,
    extensionsGallery={'serviceUrl':'https://open-vsx.org/vscode/gallery','itemUrl':'https://open-vsx.org/vscode/item'})
product['extensionKind'] = {}
for manifest in (up/'extensions').glob('*/package.json'):
    extension = json.loads(manifest.read_text())
    if extension.get('main'):
        product['extensionKind'][extension.get('publisher','vscode')+'.'+extension['name']] = ['workspace', '-web']
p.write_text(json.dumps(product,indent='\t')+'\n')

name='src/vs/server/node/webClientServer.ts'
edit(name,"\t\tlet _wrapWebWorkerExtHostInIframe: undefined | false = undefined;", "\t\tlet _wrapWebWorkerExtHostInIframe: undefined | false = process.env['PARADISE_ORIGIN'] ? false : undefined;")
edit(name,"\t\t\tremoteAuthority,\n\t\t\tserverBasePath: basePath,", "\t\t\tremoteAuthority,\n\t\t\twebviewEndpoint: process.env['PARADISE_WEBVIEW_ORIGIN'] ? `${process.env['PARADISE_WEBVIEW_ORIGIN']}/` : undefined,\n\t\t\tserverBasePath: basePath,")
edit(name,"`frame-src 'self' https://*.vscode-cdn.net data:;`,", "`frame-src 'self' https://*.vscode-cdn.net ${process.env['PARADISE_WEBVIEW_ORIGIN']?.replace('{{uuid}}', '*') ?? ''} data:;`,")

name='src/vs/server/node/remoteExtensionHostAgentServer.ts'
edit(name,"\tpublic async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {", """\tpublic async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const paradiseOrigin = process.env['PARADISE_ORIGIN'];
		if (paradiseOrigin && (req.headers.host !== new URL(paradiseOrigin).host ||
			(req.headers.origin && req.headers.origin !== paradiseOrigin))) {
			return serveError(req, res, 403, 'Origin not allowed.');
		}
""")
edit(name,"\tpublic handleUpgrade(req: http.IncomingMessage, socket: net.Socket) {", """\tpublic handleUpgrade(req: http.IncomingMessage, socket: net.Socket) {
		const paradiseOrigin = process.env['PARADISE_ORIGIN'];
		if (paradiseOrigin && (req.headers.host !== new URL(paradiseOrigin).host || req.headers.origin !== paradiseOrigin)) {
			socket.end('HTTP/1.1 403 Forbidden\\r\\nConnection: close\\r\\n\\r\\n');
			return;
		}
""")

name='src/vs/code/browser/workbench/workbench.ts'
edit(name,"import { create } from '../../../workbench/workbench.web.main.internal.js';", """import { create, commands } from '../../../workbench/workbench.web.main.internal.js';
import { CommandsRegistry } from '../../../platform/commands/common/commands.js';
import { IDialogService } from '../../../platform/dialogs/common/dialogs.js';
import { IWorkingCopyService } from '../../../workbench/services/workingCopy/common/workingCopyService.js';
import { IEditorService } from '../../../workbench/services/editor/common/editorService.js';
import { ITerminalService } from '../../../workbench/contrib/terminal/browser/terminal.js';
import { ILifecycleService } from '../../../workbench/services/lifecycle/common/lifecycle.js';
import { IStorageService, WillSaveStateReason } from '../../../platform/storage/common/storage.js';
import { localize } from '../../../nls.js';

CommandsRegistry.registerCommand('paradise.prepareClose', async (accessor, updating = false) => {
	const workingCopies = accessor.get(IWorkingCopyService);
	const dialogs = accessor.get(IDialogService);
	const editors = accessor.get(IEditorService);
	const terminals = accessor.get(ITerminalService);
	const lifecycle = accessor.get(ILifecycleService);
	const storage = accessor.get(IStorageService);
	if (workingCopies.dirtyCount > 0) {
		const answer = await dialogs.confirm({ message: updating ? localize('paradise.unsavedUpdate', 'Save your changes before updating?') : localize('paradise.unsaved', 'Save your changes before closing?'), primaryButton: updating ? localize('paradise.saveUpdate', 'Save All and Update') : localize('paradise.saveClose', 'Save All and Close') });
		if (!answer.confirmed || !(await editors.saveAll({ includeUntitled: true })).success || workingCopies.dirtyCount > 0) { return false; }
	}
	if (terminals.instances.length > 0) {
		const answer = await dialogs.confirm({ message: updating ? localize('paradise.updateTerminals', 'Stop this window’s terminals and restart to update?') : localize('paradise.terminals', 'Close this window and stop its terminals?'), primaryButton: updating ? localize('paradise.restartUpdate', 'Restart and Update') : localize('paradise.close', 'Close Window') });
		if (!answer.confirmed) { return false; }
	}
	if (updating) {
		// Persist the new editor identity after Save As before native installation restarts WebKit.
		// Keep the workbench alive so a cancelled or failed installation remains usable.
		await storage.flush(WillSaveStateReason.SHUTDOWN);
	} else {
		await lifecycle.shutdown();
	}
	return true;
});

Object.defineProperty(mainWindow, 'paradiseWorkbench', { value: {
	executeCommand: commands.executeCommand,
	prepareClose: () => commands.executeCommand('paradise.prepareClose'),
	prepareUpdate: () => commands.executeCommand('paradise.prepareClose', true)
} });
""")
name='src/vs/server/node/webClientServer.ts'
edit(name, "\t\tconst productConfiguration: Partial<Mutable<IProductConfiguration>> = {", "\t\tconst productConfiguration: Partial<Mutable<IProductConfiguration>> = {\n\t\t\tcommit: this._productService.commit,")
edit(name, "\t\t\tserverBasePath: basePath,", "\t\t\tconfigurationDefaults: { 'chat.disableAIFeatures': true, 'telemetry.telemetryLevel': 'off', 'workbench.enableExperiments': false, 'window.autoDetectColorScheme': true },\n\t\t\tserverBasePath: basePath,")
name='src/vs/platform/files/node/watcher/nodejs/nodejsWatcherLib.ts'
edit(name, "if (isMacintosh && isEqualOrParent(realPath, '/Volumes/', true)) {", "if (isMacintosh && isEqualOrParent(realPath, '/Volumes/', true) && !(process.env['PARADISE_LOCAL_VOLUME'] && isEqualOrParent(realPath, process.env['PARADISE_LOCAL_VOLUME']!, true))) {")
# The first release deliberately excludes the Copilot extension (AI is out of scope).
name='build/gulpfile.reh.ts'
edit(name, "const localWorkspaceExtensions = glob.sync('extensions/*/package.json')", "const localWorkspaceExtensions = glob.sync('extensions/*/package.json').filter(extensionPath => extensionPath !== 'extensions/copilot/package.json')")
edit(name, "\t\t\t\tcompileCopilotExtensionBuildTask,", "\t\t\t\t// Paradise: AI extensions are not bundled in the local-web release.")
edit(name, "\t\t\t\tprepareCopilotRipgrepShimTaskREH(platform, arch, destinationFolderName)", "\t\t\t\t// Paradise: no bundled Copilot SDK to patch.")
# Open VSX supplies canonical asset URLs. Use those instead of Microsoft's legacy URL shape.
name='src/vs/platform/extensionManagement/common/extensionGalleryService.ts'
edit(name, "function getDownloadAsset(version: IRawGalleryExtensionVersion): IGalleryExtensionAsset {", """function getDownloadAsset(version: IRawGalleryExtensionVersion): IGalleryExtensionAsset {
	if (version.assetUri.startsWith('https://open-vsx.org/')) {
		const asset = getVersionAsset(version, AssetType.VSIX);
		if (asset) { return asset; }
	}
""")
edit(name, "\tconst result = version.files.filter(f => f.assetType === type)[0];", """	const result = version.files.filter(f => f.assetType === type)[0];
	if (version.assetUri.startsWith('https://open-vsx.org/') && result?.source.startsWith('https://open-vsx.org/api/')) {
		return { uri: result.source, fallbackUri: result.source };
	}
""")
# Verify Open VSX's registry signature format, which differs from the Marketplace verifier.
name='src/vs/platform/extensionManagement/node/extensionSignatureVerificationService.ts'
edit(name, "import { getErrorMessage }", """import { createPublicKey, verify as verifySignature } from 'crypto';
import { readFile } from 'fs/promises';
import { buffer as readZipEntry } from '../../../base/node/zip.js';
import { IProductService } from '../../product/common/productService.js';
import { getErrorMessage }""")
edit(name, "\t\t@ILogService private readonly logService: ILogService,", "\t\t@IProductService private readonly productService: IProductService,\n\t\t@ILogService private readonly logService: ILogService,")
edit(name, "\t\tlet module: typeof vsceSign;", """		if (this.productService.extensionsGallery?.serviceUrl === 'https://open-vsx.org/vscode/gallery') {
			try {
				const [namespace, name] = extensionId.split('.');
				if (!namespace || !name) { throw new Error('Invalid extension identifier'); }
				const vsixManifest = (await readZipEntry(vsixFilePath, 'extension.vsixmanifest')).toString('utf8');
				const packageTarget = /TargetPlatform="([^"]+)"/.exec(vsixManifest)?.[1];
				const target = packageTarget && packageTarget !== 'universal' ? `${encodeURIComponent(packageTarget)}/` : '';
				const response = await fetch(`https://open-vsx.org/api/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/${target}${encodeURIComponent(version)}`, { signal: AbortSignal.timeout(15000) });
				if (!response.ok) { throw new Error(`Open VSX metadata returned ${response.status}`); }
				const metadata = await response.json() as { files?: { publicKey?: string } };
				const keyUrl = new URL(metadata.files?.publicKey ?? '');
				if (keyUrl.origin !== 'https://open-vsx.org' || !keyUrl.pathname.startsWith('/api/-/public-key/')) { throw new Error('Unexpected registry key URL'); }
				const keyResponse = await fetch(keyUrl, { signal: AbortSignal.timeout(15000), redirect: 'error' });
				if (!keyResponse.ok) { throw new Error(`Open VSX key returned ${keyResponse.status}`); }
				const key = createPublicKey(await keyResponse.text());
				const signature = await readZipEntry(signatureArchiveFilePath, '.signature.sig');
				const verified = verifySignature(null, await readFile(vsixFilePath), key, signature);
				return { code: verified ? ExtensionSignatureVerificationCode.Success : ExtensionSignatureVerificationCode.PackageIntegrityCheckFailed };
			} catch (error) {
				this.logService.error('Open VSX signature verification failed', getErrorMessage(error));
				return { code: ExtensionSignatureVerificationCode.UnknownError };
			}
		}
		let module: typeof vsceSign;""")

# No upstream source is deleted; all changes remain inspectable as a single patch.
# Receive binary frames directly: avoid Blob/FileReader allocation and asynchronous queues.
name='src/vs/platform/remote/browser/browserSocketFactory.ts'
source=original(name)
start=source.index('\t\tthis._fileReader = new FileReader();')
end=source.index("\t\tthis._socket.addEventListener('message'", start)
edit(name,source[start:end],"""\t\tthis._socket.binaryType = 'arraybuffer';
\t\tthis._isClosed = false;
\t\tthis._socketMessageListener = (event: MessageEvent<ArrayBuffer>) => {
\t\t\tthis.traceSocketEvent(SocketDiagnosticsEventType.Read, event.data);
\t\t\tthis._onData.fire(event.data);
\t\t};
""")
for declaration in ['\tprivate readonly _fileReader: FileReader;\n','\tprivate readonly _queue: Blob[];\n','\tprivate _isReading: boolean;\n']:
    edit(name,declaration,'')
# All simplified dialogs (Open, folder, Save As, VSIX) use the native panel.
name='src/vs/workbench/services/dialogs/browser/abstractFileDialogService.ts'
edit(name, "\tprivate pickResource(options: IOpenDialogOptions): Promise<URI[] | undefined> {", """\tprivate paradisePicker(options: IOpenDialogOptions | ISaveDialogOptions, save: boolean): Promise<URI[] | undefined> | undefined {
\t\tconst host = window as Window & { paradiseDesktop?: { pick(options: unknown): Promise<string[] | null> } };
\t\tif (!host.paradiseDesktop) { return undefined; }
\t\tconst open = options as IOpenDialogOptions;
\t\treturn host.paradiseDesktop.pick({ save, folders: !!open.canSelectFolders && !open.canSelectFiles, multiple: !!open.canSelectMany,
\t\t\ttitle: options.title, defaultPath: options.defaultUri?.path, filters: options.filters ?? []
\t\t}).then(paths => paths?.map(path => URI.from({ scheme: Schemas.vscodeRemote, authority: this.environmentService.remoteAuthority, path: URI.file(path).path })));
\t}

\tprivate pickResource(options: IOpenDialogOptions): Promise<URI[] | undefined> {
\t\tconst native = this.paradisePicker(options, false);
\t\tif (native) { return native; }
""")
edit(name, "\tprivate saveRemoteResource(options: ISaveDialogOptions): Promise<URI | undefined> {", """\tprivate saveRemoteResource(options: ISaveDialogOptions): Promise<URI | undefined> {
\t\tconst native = this.paradisePicker(options, true);
\t\tif (native) { return native.then(paths => paths?.[0]); }
""")

# WKWebView cannot share browser-only resource clipboards between native windows.
# Use the macOS pasteboard for local file URLs and text, including Finder copies.
name='src/vs/platform/clipboard/browser/clipboardService.ts'
edit(name, "const vscodeResourcesMime = 'application/vnd.code.resources';", """const vscodeResourcesMime = 'application/vnd.code.resources';

interface ParadiseClipboard {
	readText(): Promise<string>;
	writeText(text: string): Promise<void>;
	readResources(): Promise<string[]>;
	writeResources(paths: string[]): Promise<void>;
}

function paradiseClipboard(): ParadiseClipboard | undefined {
	return (getActiveWindow() as Window & { paradiseDesktop?: { clipboard?: ParadiseClipboard } }).paradiseDesktop?.clipboard;
}
""")
edit(name, "if (isSafari || isWebkitWebView) {", "if (!paradiseClipboard() && (isSafari || isWebkitWebView)) {")
edit(name, "\t\tif (this.webKitPendingClipboardWritePromise) {", """		const native = paradiseClipboard();
		if (native) { return native.writeText(text); }

		if (this.webKitPendingClipboardWritePromise) {""")
edit(name, "\t\t\tconst readText = await getActiveWindow().navigator.clipboard.readText();", """			const native = paradiseClipboard();
			const readText = await (native ? native.readText() : getActiveWindow().navigator.clipboard.readText());""")
edit(name, "\tasync writeResources(resources: URI[]): Promise<void> {", """	async writeResources(resources: URI[]): Promise<void> {
		const native = paradiseClipboard();
		if (native) {
			if (resources.some(resource => resource.scheme !== 'file' && resource.scheme !== 'vscode-remote')) {
				throw new Error('Only local files can be copied to the native clipboard.');
			}
			await native.writeResources(resources.map(resource => resource.path));
			this.clearResourcesState();
			return;
		}
""")
edit(name, "\tasync readResources(): Promise<URI[]> {", """	async readResources(): Promise<URI[]> {
		const native = paradiseClipboard();
		if (native) {
			return (await native.readResources()).map(path => URI.from({ scheme: 'vscode-remote', authority: getActiveWindow().location.host, path: URI.file(path).path }));
		}
""")
edit(name, "\tasync hasResources(): Promise<boolean> {", """	async hasResources(): Promise<boolean> {
		const native = paradiseClipboard();
		if (native) { return (await native.readResources()).length > 0; }
""")

# The Workbench subclass overrides readText; keep it on the native path too.
name='src/vs/workbench/services/clipboard/browser/clipboardService.ts'
edit(name, "\t\tif (type) {", "\t\tif (type || (getActiveWindow() as Window & { paradiseDesktop?: { clipboard?: unknown } }).paradiseDesktop?.clipboard) {")

# WKWebView can omit copy/cut DOM events from programmatic native menu actions.
# Reuse Monaco's selection/multicursor metadata and cut handler, then await the
# native clipboard write before deleting text. Paste uses the existing web fallback.
name='src/vs/editor/contrib/clipboard/browser/clipboard.ts'
edit(name, "\t\t\t// TODO this is very ugly. The entire copy/paste/cut system needs a complete refactoring.", """			if ((getActiveWindow() as Window & { paradiseDesktop?: { clipboard?: unknown } }).paradiseDesktop?.clipboard) {
				const { dataToCopy } = generateDataToCopyAndStoreInMemory(focusedEditor._getViewModel(), undefined, browser.isFirefox);
				return clipboardService.writeText(dataToCopy.text).then(() => {
					if (browserCommand === 'cut') { focusedEditor.trigger(undefined, Handler.Cut, undefined); }
				});
			}
			// TODO this is very ugly. The entire copy/paste/cut system needs a complete refactoring.""")

# Keep cut/copy semantics on the pasteboard, rather than in one window's globals.
name='src/vs/workbench/contrib/files/browser/explorerService.ts'
edit(name, "\t\tawait this.clipboardService.writeResources(items.map(s => s.resource));", """		const native = (window as Window & { paradiseDesktop?: { clipboard?: { writeResources(paths: string[], moveFiles: boolean): Promise<void> } } }).paradiseDesktop?.clipboard;
		if (native) { await native.writeResources(items.map(item => item.resource.path), cut); }
		else { await this.clipboardService.writeResources(items.map(s => s.resource)); }""")
name='src/vs/workbench/contrib/files/browser/fileActions.ts'
edit(name, "\tconst toPaste = await getFilesToPaste(fileList, clipboardService, hostService);", """	const toPaste = await getFilesToPaste(fileList, clipboardService, hostService);
	const native = (window as Window & { paradiseDesktop?: { clipboard?: { shouldMoveResources(): boolean } } }).paradiseDesktop?.clipboard;
	if (native) { pasteShouldMove = toPaste.type === 'paths' && !hasNativeFilesToPaste && native.shouldMoveResources(); }""")

for name, content in changes.items():
    (up/name).write_text(content)

(root/'patches/paradise.patch').write_bytes(subprocess.check_output(['git','diff','--','product.json','src/vs/editor/contrib/clipboard/browser/clipboard.ts','src/vs/workbench/services/clipboard/browser/clipboardService.ts','src/vs/workbench/contrib/files/browser/explorerService.ts','src/vs/workbench/contrib/files/browser/fileActions.ts','src/vs/platform/clipboard/browser/clipboardService.ts','src/vs/workbench/services/dialogs/browser/abstractFileDialogService.ts','src/vs/platform/remote/browser/browserSocketFactory.ts','src/vs/server/node/webClientServer.ts','src/vs/server/node/remoteExtensionHostAgentServer.ts','src/vs/code/browser/workbench/workbench.ts','build/gulpfile.reh.ts','src/vs/platform/extensionManagement/node/extensionSignatureVerificationService.ts','src/vs/platform/extensionManagement/common/extensionGalleryService.ts','src/vs/platform/files/node/watcher/nodejs/nodejsWatcherLib.ts'],cwd=up))
