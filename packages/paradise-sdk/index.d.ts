import type * as vscode from 'vscode';
export interface ParadiseAPI {
 command(id: string, handler: (...args: unknown[]) => unknown): vscode.Disposable;
 status(text: string, command?: string): vscode.StatusBarItem;
 notify(message: string): Thenable<string | undefined>;
 storage: vscode.Memento;
 workspace: typeof vscode.workspace;
 vscode: typeof vscode;
 dispose<T extends vscode.Disposable>(resource: T): T;
}
export function defineExtension<T>(define: (api: ParadiseAPI, context: vscode.ExtensionContext) => T): { activate(context: vscode.ExtensionContext): T };
