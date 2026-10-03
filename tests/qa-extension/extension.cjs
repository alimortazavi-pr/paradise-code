const vscode=require('vscode');
const fs=require('node:fs/promises');
const path=require('node:path');
exports.activate=async context=>{
  if(process.env.PARADISE_BENCHMARK_FILE){
    const output=process.env.PARADISE_BENCHMARK_FILE;
    (async()=>{
      const root=vscode.workspace.workspaceFolders[0].uri;
      await vscode.extensions.getExtension('vscode.typescript-language-features').activate();
      await vscode.extensions.getExtension('esbenp.prettier-vscode')?.activate();
      await vscode.extensions.getExtension('dbaeumer.vscode-eslint')?.activate();
      const doc=await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root,'example.ts'));
      await vscode.window.showTextDocument(doc);
      let symbols=[];for(let i=0;i<100&&!symbols.length;i++){symbols=await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider',doc.uri)||[];if(!symbols.length)await new Promise(r=>setTimeout(r,100));}
      if(!symbols.length)throw Error('Language service unavailable');
      const terminal=vscode.window.createTerminal({name:'Benchmark idle terminal',cwd:root.fsPath});terminal.show();
      await terminal.processId;
      const readyMs=Date.now()-Number(process.env.PARADISE_BENCHMARK_START);
      const result={readyMs,node:process.versions.node,symbols:symbols.length,operations:[]};
      await fs.writeFile(output,JSON.stringify({...result,phase:'ready'},null,2));
      await new Promise(r=>setTimeout(r,20000));
      for(let i=0;i<20;i++){
        const start=performance.now();await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider',doc.uri);
        const symbolsMs=performance.now()-start;const searchStart=performance.now();await vscode.workspace.findFiles('**/*.ts','**/node_modules/**');
        result.operations.push({symbolsMs,searchMs:performance.now()-searchStart});
      }
      await fs.writeFile(output,JSON.stringify({...result,phase:'complete'},null,2));
    })().catch(error=>fs.writeFile(output,JSON.stringify({error:String(error)})));
  }

  context.subscriptions.push(vscode.commands.registerCommand('paradise.qa.run',async()=>{
    const root=vscode.workspace.workspaceFolders?.[0]?.uri;
    if(!root) throw new Error('Open the acceptance fixture first.');
    const results=[];
    const delay=ms=>new Promise(r=>setTimeout(r,ms));
    const check=async(name,fn)=>{try{const detail=await fn();results.push({name,passed:true,detail});}catch(error){results.push({name,passed:false,error:String(error)});}};
    await check('node-extension-host',async()=>({node:process.versions.node,platform:process.platform,arch:process.arch}));
    await check('read-and-edit-file',async()=>{
      const uri=vscode.Uri.joinPath(root,'qa فارسی.txt');await vscode.workspace.fs.writeFile(uri,Buffer.from('سلام Paradise\n'));
      const document=await vscode.workspace.openTextDocument(uri);await vscode.window.showTextDocument(document);
      const edit=new vscode.WorkspaceEdit();edit.insert(uri,new vscode.Position(1,0),'saved through extension API\n');
      if(!await vscode.workspace.applyEdit(edit)||!await document.save())throw Error('Save failed');
      const text=Buffer.from(await vscode.workspace.fs.readFile(uri)).toString();if(!text.includes('saved through'))throw Error('Content mismatch');return text;
    });
    await check('typescript-language-service',async()=>{
      const document=await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root,'example.ts'));
      await vscode.window.showTextDocument(document);
      await vscode.extensions.getExtension('vscode.typescript-language-features')?.activate();
      for(let i=0;i<10;i++){const symbols=await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider',document.uri);if(symbols?.length)return {symbols:symbols.length};await new Promise(r=>setTimeout(r,1000));}throw Error('No symbols');
    });
    await check('git-extension',async()=>{const ext=vscode.extensions.getExtension('vscode.git');if(!ext)throw Error('Missing Git');const api=(await ext.activate()).getAPI(1);return {repositories:api.repositories.length};});
    await check('terminal-process',async()=>{
      const marker=path.join(root.fsPath,'terminal-result.txt');await fs.rm(marker,{force:true});const terminal=vscode.window.createTerminal({name:'Paradise acceptance',cwd:root.fsPath});terminal.show();terminal.sendText("printf 'terminal-ok' > terminal-result.txt");
      try{for(let i=0;i<20;i++){if(await fs.readFile(marker,'utf8').catch(()=>null)==='terminal-ok')return 'PTY command completed';await new Promise(r=>setTimeout(r,500));}throw Error('Terminal command timed out');}finally{terminal.dispose();}
    });
    await check('file-watcher',async()=>{
      const file=vscode.Uri.joinPath(root,'watch-proof.txt');
      const watcher=vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root,'watch-proof.txt'));
      let seen=false;const sub=watcher.onDidCreate(()=>seen=true);
      try{await vscode.workspace.fs.delete(file).then(()=>delay(300),()=>{});await vscode.workspace.fs.writeFile(file,Buffer.from('watch'));for(let i=0;i<30&&!seen;i++)await delay(100);if(!seen)throw Error('No create event');return 'File creation observed';}finally{sub.dispose();watcher.dispose();}
    });
    await check('workspace-search',async()=>{const found=await vscode.workspace.findFiles('**/*.ts','**/node_modules/**');if(!found.some(f=>f.path.endsWith('/example.ts')))throw Error('Missing TypeScript fixture');return {files:found.length};});
    await check('prettier-format',async()=>{
      const ext=vscode.extensions.getExtension('esbenp.prettier-vscode');if(!ext)throw Error('Prettier missing');await ext.activate();
      const uri=vscode.Uri.joinPath(root,'format.ts');await vscode.workspace.fs.writeFile(uri,Buffer.from('const formatted={hello:"world"};\n'));const doc=await vscode.workspace.openTextDocument(uri);await vscode.window.showTextDocument(doc);
      await vscode.workspace.getConfiguration('editor',uri).update('defaultFormatter','esbenp.prettier-vscode',vscode.ConfigurationTarget.Workspace);
      await vscode.commands.executeCommand('editor.action.formatDocument');await doc.save();if(!doc.getText().includes('hello: "world"'))throw Error('Format did not run');return doc.getText();
    });
    await check('eslint-diagnostics',async()=>{
      const ext=vscode.extensions.getExtension('dbaeumer.vscode-eslint');if(!ext)throw Error('ESLint missing');await ext.activate();
      const uri=vscode.Uri.joinPath(root,'lint.js');await vscode.workspace.fs.writeFile(uri,Buffer.from('const unused = 1;\n'));const doc=await vscode.workspace.openTextDocument(uri);await vscode.window.showTextDocument(doc);
      for(let i=0;i<150;i++){const diagnostics=vscode.languages.getDiagnostics(uri).filter(d=>d.source==='eslint');if(diagnostics.some(d=>JSON.stringify(d.code).includes('no-unused-vars')))return {diagnostics:diagnostics.length};await delay(100);}throw Error('ESLint reported no expected diagnostic');
    });
    await check('git-stage-commit',async()=>{const repo=(await vscode.extensions.getExtension('vscode.git').activate()).getAPI(1).repositories[0];const file=path.join(root.fsPath,'git-proof.txt');await fs.writeFile(file,`Acceptance ${Date.now()}\n`);await repo.add([file]);await repo.commit('Verify Paradise Git integration',{all:false});await repo.status();if(repo.state.indexChanges.length)throw Error('Index not empty');return {commit:repo.state.HEAD.commit};});
    await check('task-execution',async()=>{
      let code;const sub=vscode.tasks.onDidEndTaskProcess(e=>{if(e.execution.task.name==='Paradise acceptance task')code=e.exitCode;});
      try{const task=new vscode.Task({type:'shell'},vscode.workspace.workspaceFolders[0],'Paradise acceptance task','Paradise',new vscode.ShellExecution('node main.js'));await vscode.tasks.executeTask(task);for(let i=0;i<100&&code===undefined;i++)await delay(100);if(code!==0)throw Error('Task exit '+code);return {exitCode:code};}finally{sub.dispose();}
    });
    await check('node-debug-breakpoint',async()=>{
      const breakpoints=[new vscode.SourceBreakpoint(new vscode.Location(vscode.Uri.joinPath(root,'main.js'),new vscode.Position(1,0)))];vscode.debug.addBreakpoints(breakpoints);
      let stopped;let session;
      const tracker=vscode.debug.registerDebugAdapterTrackerFactory('*',{createDebugAdapterTracker(s){return {onDidSendMessage(m){if(m.type==='event'&&m.event==='stopped'){stopped=m.body;session=s;}}};}});
      try{const started=await vscode.debug.startDebugging(vscode.workspace.workspaceFolders[0],{type:'node',request:'launch',name:'Paradise breakpoint proof',program:path.join(root.fsPath,'main.js'),runtimeExecutable:process.execPath,console:'internalConsole'});if(!started)throw Error('Debug launch rejected');for(let i=0;i<150&&!stopped;i++)await delay(100);if(stopped?.reason!=='breakpoint')throw Error('No breakpoint stop: '+JSON.stringify(stopped));const threads=await session.customRequest('threads');const stack=await session.customRequest('stackTrace',{threadId:threads.threads[0].id});if(stack.stackFrames[0].line!==2)throw Error('Unexpected line');return {reason:stopped.reason,line:2};}finally{if(session)await vscode.debug.stopDebugging(session);tracker.dispose();vscode.debug.removeBreakpoints(breakpoints);}
    });
    await check('webview-worker-and-bridge-isolation',async()=>{
      const panel=vscode.window.createWebviewPanel('paradise.qa','Paradise webview proof',vscode.ViewColumn.Active,{enableScripts:true});
      try{return await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(Error('Webview worker timed out')),15000);
        panel.webview.onDidReceiveMessage(message=>{clearTimeout(timeout);if(!message.worker||message.bridge||!message.parentBlocked)reject(Error(JSON.stringify(message)));else resolve(message);});
        panel.webview.html=`<!doctype html><html><body>Testing isolated extension webview<script>const api=acquireVsCodeApi();let parentBlocked=false;try{void top.paradiseNative}catch{parentBlocked=true}const worker=new Worker(URL.createObjectURL(new Blob(['postMessage("worker-ok")'],{type:'text/javascript'})));worker.onmessage=e=>{api.postMessage({worker:e.data==='worker-ok',bridge:typeof window.paradiseNative!=='undefined'||typeof window.__TAURI_INTERNALS__!=='undefined',parentBlocked});worker.terminate()};</script></body></html>`;
      });}finally{panel.dispose();}
    });
    const result=path.join(root.fsPath,'qa-results.json');await fs.writeFile(result,JSON.stringify(results,null,2));
    vscode.window.showInformationMessage(`Paradise acceptance: ${results.filter(r=>r.passed).length}/${results.length} passed`);
  }));
};
