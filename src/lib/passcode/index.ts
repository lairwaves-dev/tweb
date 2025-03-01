import convertToUint8Array from '../../helpers/bytes/convertToUint8Array';
import {joinDeepPath} from '../../helpers/object/setDeepProperty';

import commonStateStorage from '../commonStateStorage';
import sha256 from '../crypto/utils/sha256';
import {useHotReloadGuard} from '../solidjs/hotReloadGuard';

export const MAX_PASSCODE_LENGTH = 12;

export function usePasscodeActions() {
  const {rootScope, apiManagerProxy} = useHotReloadGuard();

  async function enablePasscode(passcode: string) {
    await savePasscodeHashToStorage(passcode);
    passcode = ''; // forget
    await rootScope.managers.appStateManager.setByKey(joinDeepPath('settings', 'passcode', 'enabled'), true);
    rootScope.dispatchEvent('toggle_using_passcode', true);
    apiManagerProxy.invokeVoid('toggleUsingPasscode', true);
  }

  async function isMyPasscode(passcode: string) {
    const passcodeData = await commonStateStorage.get('passcode', false);
    if(!passcodeData?.hash || !passcodeData?.salt) return false;

    const hashed = await hashPasscode(passcode, passcodeData.salt);
    passcode = ''; // forget

    return compareUint8Arrays(hashed, passcodeData.hash);
  }

  async function disablePasscode() {
    await rootScope.managers.appStateManager.setByKey(joinDeepPath('settings', 'passcode', 'enabled'), false);
    rootScope.dispatchEvent('toggle_using_passcode', false);
    apiManagerProxy.invokeVoid('toggleUsingPasscode', false);
    await commonStateStorage.delete('passcode');
  }

  async function changePasscode(passcode: string) {
    const saltAndHash = await createPasscodeHashAndSalt(passcode)
    passcode = ''; // forget

    apiManagerProxy.invoke('changePasscode', saltAndHash);
    await commonStateStorage.set({
      passcode: saltAndHash
    });
  }

  return {
    enablePasscode,
    isMyPasscode,
    disablePasscode,
    changePasscode
  };
}

// TODO: Handle errors?

function compareUint8Arrays(arr1: Uint8Array, arr2: Uint8Array) {
  return arr1.length === arr2.length && arr1.every((value, index) => value === arr2[index]);
}

function hashPasscode(passcode: string, salt: Uint8Array) {
  const saltedPasscode = new Uint8Array([...convertToUint8Array(passcode), ...salt]);
  passcode = ''; // forget
  return sha256(saltedPasscode);
}

async function createPasscodeHashAndSalt(passcode: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPasscode(passcode, salt);
  passcode = ''; // forget

  return {salt, hash};
}

async function savePasscodeHashToStorage(passcode: string) {
  const saltAndHash = await createPasscodeHashAndSalt(passcode)
  passcode = ''; // forget

  await commonStateStorage.set({
    passcode: saltAndHash
  });
}
