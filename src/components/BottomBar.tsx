import { GlassSurface } from './GlassSurface';

export type BottomTab = 'map' | 'journal';

function IconGlobe(props: { size?: number }) {
  const s = props.size ?? 22;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M3.5 12h17"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M12 3c2.8 2.7 2.8 15.3 0 18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M12 3c-2.8 2.7-2.8 15.3 0 18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconPlus(props: { size?: number }) {
  const s = props.size ?? 22;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 5v14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconBook(props: { size?: number }) {
  const s = props.size ?? 22;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M4.5 5.5c0-1.1.9-2 2-2H11c1.1 0 2 .9 2 2v15c0-.8-.7-1.5-1.5-1.5H6.5c-1.1 0-2-.9-2-2v-11Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M19.5 5.5c0-1.1-.9-2-2-2H13c-1.1 0-2 .9-2 2v15c0-.8.7-1.5 1.5-1.5h5c1.1 0 2-.9 2-2v-11Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BottomBar(props: {
  activeTab: BottomTab;
  onChangeTab: (tab: BottomTab) => void;
  onPressAdd: () => void;
}) {
  const { activeTab, onChangeTab, onPressAdd } = props;

  return (
    <div className="bottomBarWrap" role="navigation" aria-label="Main">
      <GlassSurface className="bottomBar">
        <button
          type="button"
          className={['bottomBarBtn', activeTab === 'map' ? 'isActive' : '']
            .filter(Boolean)
            .join(' ')}
          onClick={() => onChangeTab('map')}
          aria-label="Map"
        >
          <span className="bottomBarPill">
            <IconGlobe />
          </span>
        </button>

        <button
          type="button"
          className="bottomBarAdd"
          onClick={onPressAdd}
          aria-label="Add"
        >
          <span className="bottomBarAddIcon">
            <IconPlus size={24} />
          </span>
        </button>

        <button
          type="button"
          className={['bottomBarBtn', activeTab === 'journal' ? 'isActive' : '']
            .filter(Boolean)
            .join(' ')}
          onClick={() => onChangeTab('journal')}
          aria-label="Journal"
        >
          <span className="bottomBarPill">
            <IconBook />
          </span>
        </button>
      </GlassSurface>
    </div>
  );
}
