import { render, screen } from '@testing-library/react-native';
import { CREATOR_MARKS } from '@shared/creator-marks';
import { CreatorAvatar } from './CreatorAvatar';

const pathData = (): string[] => {
    const found: string[] = [];
    const walk = (node: any) => {
        if (typeof node.props?.d === 'string') found.push(node.props.d);
        (node.children ?? []).forEach((child: any) => typeof child === 'object' && walk(child));
    };
    walk(screen.toJSON() as any);
    return found;
};

it.each([['claude', 'Claude'], ['gpt', 'GPT']])('renders the %s mark labelled with its name', async (id, name) => {
    await render(<CreatorAvatar creatorId={id} size={40}/>);
    expect(screen.getByLabelText(name)).toBeTruthy();
    expect(pathData()).toContain(CREATOR_MARKS[id].path);
});

it('falls back to initials for an unknown creator', async () => {
    await render(<CreatorAvatar creatorId="zed"/>);
    expect(screen.getByLabelText('zed')).toBeTruthy();
    expect(screen.getByText('Z')).toBeTruthy();
    expect(pathData()).toHaveLength(0);
});
