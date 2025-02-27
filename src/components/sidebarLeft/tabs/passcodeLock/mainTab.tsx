import {createSignal, Show} from 'solid-js';

import {useHotReloadGuard} from '../../../../lib/solidjs/hotReloadGuard';
import {IS_MOBILE} from '../../../../environment/userAgent';
import {i18n} from '../../../../lib/langPack';

import Section from '../../../section';
import Space from '../../../space';
import ripple from '../../../ripple'; // keep
import RowTsx from '../../../rowTsx';

import LottieAnimation from './lottieAnimation';
import {useSuperTab} from './superTabProvider';
import StaticSwitch from './staticSwitch';
import InlineSelect from './inlineSelect';
import ShortcutBuilder, {ShortcutKey} from './shortcutBuilder';

import commonStyles from './common.module.scss';
import styles from './mainTab.module.scss';

const MainTab = () => {
  return (
    <>
      <PasscodeSetContent />
      {/* <NoPasscodeContent /> */}
    </>
  );
};

const NoPasscodeContent = () => {
  const [tab, {AppPasscodeEnterPasswordTab}] = useSuperTab();

  return (
    <Section caption="PasscodeLock.Notice">
      <LottieAnimation name="UtyanPasscode" />

      <div class={styles.MainDescription}>{i18n('PasscodeLock.Description')}</div>

      <Space amount="0.5rem" />

      <div class={commonStyles.AdditionalPadding}>
        <button
          use:ripple
          class="btn-primary btn-color-primary btn-large"
          onClick={() => {
            tab.slider.createTab(AppPasscodeEnterPasswordTab)
            .open();
          }}
        >
          {i18n('PasscodeLock.TurnOn')}
        </button>
      </div>

      <Space amount="1rem" />
    </Section>
  );
};


const PasscodeSetContent = () => {
  const [tab, {AppPasscodeEnterPasswordTab}] = useSuperTab();

  const [checked, setChecked] = createSignal(false);
  const [value, setValue] = createSignal('disabled');
  const options = [
    {value: 'disabled', label: 'Disabled'},
    {value: 1, label: '1 min'},
    {value: 5, label: '5 min'},
    {value: 10, label: '10 min'},
    {value: 15, label: '15 min'},
    {value: 30, label: '30 min'}
  ];

  const [autoCloseRowEl, setAutoCloseRowEl] = createSignal<HTMLElement>();
  const [isOpen, setIsOpen] = createSignal(false);
  const [keys, setKeys] = createSignal<ShortcutKey[]>(['Alt']);

  const canShowShortcut = !IS_MOBILE;

  const caption = (
    <>
      {i18n('PasscodeLock.Description')}
      <Space amount="1rem" />
      {i18n('PasscodeLock.Notice')}
    </>
  );

  return (
    <>
      <Section class={styles.FirstSection} caption={caption as any}>
        <LottieAnimation name="UtyanPasscode" />

        <Space amount="1.125rem" />

        <RowTsx
          title={i18n('PasscodeLock.TurnOff')}
          classList={{[styles.Row]: true}}
          icon="lockoff"
          clickable={(e) => {
          //
          }}
        />
        <RowTsx
          title={i18n('PasscodeLock.ChangePasscode')}
          icon="key"
          clickable={(e) => {
          //
          }}
        />
      </Section>

      <Section caption={canShowShortcut ? 'PasscodeLock.LockShortcutDescription' : undefined}>
        <RowTsx
          ref={setAutoCloseRowEl}
          classList={{[styles.Row]: true}}
          title={i18n('PasscodeLock.AutoLock')}
          rightContent={
            <InlineSelect
              value={value()}
              onClose={() => setIsOpen(false)}
              options={options}
              onChange={setValue}
              isOpen={isOpen()}
              parent={autoCloseRowEl()}
            />
          }
          clickable={(e) => {
            setIsOpen(true);
            console.log('setting isOpen to true');
          }}
        />
        <Show when={canShowShortcut}>
          <RowTsx
            title={i18n('PasscodeLock.EnableLockShortcut')}
            rightContent={
              <StaticSwitch checked={checked()} />
            }
            clickable={(e) => {
              setChecked(p => !p)
            }}
          />
          <div class={styles.ShortcutBuilderRow} classList={{[styles.collapsed]: !checked()}}>
            <ShortcutBuilder value={keys()} onChange={setKeys} key="L" />
          </div>
        </Show>
      </Section>

    </>
  );
};

export default MainTab;
