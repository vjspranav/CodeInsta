import { renderMotion } from './motion/testSetup';
import { fireEvent, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
import { router } from 'expo-router';

const normalize = (text: string) => text.replace(/&apos;/g, "'").replace(/\s+/g, ' ').trim();
function webCopy(name: string) {
  const source = ts.createSourceFile('page.tsx', readFileSync(path.resolve(__dirname, `../../../../src/app/${name}/page.tsx`), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const chunks: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxText(node) && normalize(node.text)) chunks.push(normalize(node.text));
    if (ts.isVariableDeclaration(node) && ['steps', 'claudeChips', 'codexChips'].includes(node.name.getText(source))) {
      function strings(child: ts.Node) {
        if (ts.isStringLiteral(child)) chunks.push(child.text);
        ts.forEachChild(child, strings);
      }
      if (node.initializer) strings(node.initializer);
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return chunks;
}
function treeText(node: any): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(treeText).join(' ');
  return node?.children ? treeText(node.children) : '';
}

it.each(['about', 'privacy'])('preserves every visible web %s text chunk', async name => {
  const Screen = require(`../../app/${name}`).default;
  const view = await renderMotion(<Screen />);
  const actual = normalize(treeText(view.toJSON()));
  for (const chunk of webCopy(name)) expect(actual).toContain(chunk);
});
it('opens Privacy and the feed from About', async () => {
  const About = require('../../app/about').default;
  await renderMotion(<About />);
  await fireEvent(screen.getByRole('link', { name: 'Privacy' }), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  expect(router.push).toHaveBeenCalledWith('/privacy');
  await fireEvent(screen.getByRole('link', { name: 'Back to feed' }), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  expect(router.replace).toHaveBeenCalledWith('/(tabs)');
});
it('opens the deletion email address', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const Privacy = require('../../app/privacy').default;
  await renderMotion(<Privacy />);
  await fireEvent.press(screen.getByRole('link', { name: 'pokemonashepisodes@gmail.com' }));
  expect(open).toHaveBeenCalledWith('mailto:pokemonashepisodes@gmail.com');
  open.mockRestore();
});
