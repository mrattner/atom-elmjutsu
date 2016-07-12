'use babel';

const CompositeDisposable = require('atom').CompositeDisposable;
import path from 'path';
const _ = require('underscore-plus');
import Elm from '../elm/sidekick';
const ScrollView = require('atom-space-pen-views').ScrollView;

export default class SidekickView extends ScrollView {

  static content() {
    return this.div();
  }

  constructor() {
    super();
    this.subscriptions = new CompositeDisposable();
  }

  attached() {
    const elmDiv = document.createElement('div');
    elmDiv.classList.add('elm-fu', 'sidekick');
    this.html(elmDiv);

    const sidekick = Elm.Sidekick.embed(elmDiv);
    sidekick.ports.docsLoaded.subscribe(() => {
      const editor = atom.workspace.getActiveTextEditor();
      if (isElmEditor(editor)) {
        setImports(sidekick, editor);
        setToken(sidekick, editor);
      }
    });
    var setTokenTimer = null;
    this.subscriptions.add(atom.workspace.observeTextEditors((editor) => {
      if (isElmEditor(editor)) {
        setImports(sidekick, editor);
        setToken(sidekick, editor);
        editor.onDidChangeCursorPosition((e) => {
          if (setTokenTimer) {
            clearTimeout(setTokenTimer);
          }
          setTokenTimer =
            setTimeout(() => {
              setToken(sidekick, editor);
            }, 300);
        });
        editor.onDidStopChanging(() => {
          setImports(sidekick, editor);
        });
        editor.onDidDestroy(() => {
          if (editor === atom.workspace.getActiveTextEditor()) {
            clearSidekick(sidekick);
          }
        });
      }
    }));
    this.subscriptions.add(atom.workspace.observeActivePaneItem((item) => {
      if (item && isElmEditor(item)) {
        const editor = item;
        setImports(sidekick, editor);
        setToken(sidekick, editor);
      }
    }));
  }

  detached() {
    this.subscriptions.dispose();
  }

  getURI() {
    return 'elm-fu-sidekick-view://';
  }

  getTitle() {
    return 'Elm-Fu Sidekick';
  }

}

function isElmEditor(editor) {
  return editor && editor.getPath && editor.getPath() && path.extname(editor.getPath()) === '.elm';
}

function setToken(sidekick, editor) {
  sidekick.ports.tokens.send(getToken(editor));
}

function setImports(sidekick, editor) {
  sidekick.ports.rawImports.send(parseImports(editor));
}

function clearSidekick(sidekick) {
  sidekick.ports.rawImports.send([]);
  sidekick.ports.tokens.send('');
}

function getToken(editor) {
  const scopeDescriptor = editor.scopeDescriptorForBufferPosition(editor.getCursorBufferPosition());
  if (tokenIsString(scopeDescriptor) || tokenIsComment(scopeDescriptor)) {
    return '';
  }
  return editor.getWordUnderCursor({wordRegex: /[a-zA-Z0-9_\'\|!%\$\+:\-\.=<>\/]+|\(,+\)/}).trim();
}

function tokenIsString({scopes}) {
  return _.isEqual(scopes, ['source.elm', 'string.quoted.double.elm']);
}

function tokenIsComment({scopes}) {
  return _.contains(scopes, 'comment.block.elm') || _.contains(scopes, 'comment.line.double-dash.elm');
}

function parseImports(editor) {
	const text = editor.getText();
	const regex = /(?:^|\n)import\s([\w\.]+)(?:\sas\s(\w+))?(?:\sexposing\s*\(((?:\s*(?:\w+|\(.+\))\s*,)*)\s*((?:\.\.|\w+|\(.+\)))\s*\))?/g;
	var imports = [];
  var match = regex.exec(text);
	while (match) {
		const exposedString = match[3] + match[4];
		let exposed = null;
		if (exposedString) {
			exposed = exposedString.split(',').map(function(variable) {
				const trimmed = variable.trim();
				return trimmed[0] === '(' ? trimmed.slice(1,-1).trim() : trimmed;
			});
		}
		imports.push({
			name: match[1],
			alias: match[2] || null,
			exposed: exposed
		});
    match = regex.exec(text);
	}
	return imports;
}