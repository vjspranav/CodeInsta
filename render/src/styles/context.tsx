import React, {createContext, useContext} from 'react';
import {getStyle, setActiveStyle, styleById} from './index';
import type {Style} from './types';

const Ctx = createContext<Style | null>(null);

/** Provides the active style to every component (and syncs the module-level one used by pure code). */
export const StyleProvider: React.FC<{id?: string; children: React.ReactNode}> = ({id, children}) => {
	const style = setActiveStyle(id);
	return <Ctx.Provider value={style}>{children}</Ctx.Provider>;
};

export const useStyle = (): Style => useContext(Ctx) ?? getStyle();
export {styleById};
