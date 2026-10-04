const vscode = require("vscode");
/** Register commands and resources with the standard extension lifecycle. */
function defineExtension(define) {
  return {
    activate(context) {
      const api = {
        command(id, handler) {
          const command = vscode.commands.registerCommand(id, handler);
          context.subscriptions.push(command);
          return command;
        },
        status(text, command) {
          const item = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            10,
          );
          item.text = text;
          item.command = command;
          item.show();
          context.subscriptions.push(item);
          return item;
        },
        notify(message) {
          return vscode.window.showInformationMessage(message);
        },
        storage: context.globalState,
        workspace: vscode.workspace,
        vscode,
        dispose(resource) {
          context.subscriptions.push(resource);
          return resource;
        },
      };
      return define(api, context);
    },
  };
}
module.exports = { defineExtension };
