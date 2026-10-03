const vscode = require('vscode');
exports.activate = async context => {
  const welcome = () => vscode.commands.executeCommand('workbench.action.openWalkthrough', 'paradise.paradise-onboarding#start', false);
  context.subscriptions.push(vscode.commands.registerCommand('paradise.welcome', welcome));
  if (!context.globalState.get('initialized')) {
    await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
    if (!vscode.workspace.workspaceFolders && !vscode.window.activeTextEditor) await welcome();
    await context.globalState.update('initialized', true);
  }
};
