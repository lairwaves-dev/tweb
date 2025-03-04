/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// just to include
import '../polyfill';
import '../../helpers/peerIdPolyfill';

import cryptoWorker from '../crypto/cryptoMessagePort';
import {setEnvironment} from '../../environment/utils';
import transportController from './transports/controller';
import MTProtoMessagePort from './mtprotoMessagePort';
import appManagersManager from '../appManagers/appManagersManager';
import listenMessagePort from '../../helpers/listenMessagePort';
import {logger} from '../logger';
import toggleStorages from '../../helpers/toggleStorages';
import appTabsManager from '../appManagers/appTabsManager';
import callbackify from '../../helpers/callbackify';
import Modes from '../../config/modes';
import {ActiveAccountNumber} from '../accounts/types';
import commonStateStorage from '../commonStateStorage';
import DeferredIsUsingPasscode from '../passcode/deferredIsUsingPasscode';
import AppStorage from '../storage';
import EncryptionPasscodeHashStore from '../passcode/hashStore';
import sessionStorage from '../sessionStorage';


const log = logger('MTPROTO');
// let haveState = false;

const port = new MTProtoMessagePort<false>();

let isLocked = true;

port.addMultipleEventsListeners({
  environment: (environment) => {
    setEnvironment(environment);

    if(import.meta.env.VITE_MTPROTO_AUTO && Modes.multipleTransports) {
      transportController.waitForWebSocket();
    }
  },

  crypto: ({method, args}) => {
    return cryptoWorker.invokeCrypto(method as any, ...args as any);
  },

  state: ({state, resetStorages, pushedKeys, newVersion, oldVersion, userId, accountNumber, common, refetchStorages}) => {
    // if(haveState) {
    //   return;
    // }

    log('got state', accountNumber, state, pushedKeys);

    const appStateManager = appManagersManager.stateManagersByAccount[accountNumber];
    appStateManager.userId = userId;
    appStateManager.newVersion = newVersion;
    appStateManager.oldVersion = oldVersion;

    // * preserve self user
    if(userId && resetStorages.has('users')) {
      resetStorages.set('users', [userId]);
    }

    appStateManager.resetStoragesPromise.resolve({
      storages: resetStorages,
      refetch: refetchStorages,
      callback: async() => {
        const promises: Promise<any>[] = [];

        const map: Map<string, any> = new Map();
        const pushedKeysCombined: string[] = [...pushedKeys];
        if(accountNumber === 1) {
          for(const key in common) {
            map.set(key, common[key as keyof typeof common]);
            pushedKeysCombined.push(key as any); // ! unoptimized, but it's ok for now since it's only one key
          }
        }

        for(const key in state) {
          map.set(key, state[key as keyof typeof state]);
        }

        for(const [key, value] of map) {
          const promise = appStateManager.pushToState(key as any, value, true, !pushedKeysCombined.includes(key));
          promises.push(promise);
        }

        await Promise.all(promises);
      }
    });
    // haveState = true;
  },

  toggleStorages: ({enabled, clearWrite}) => {
    return toggleStorages(enabled, clearWrite);
  },

  event: (payload, source) => {
    log('will redirect event', payload, source);
    port.invokeExceptSource('event', payload, source);
  },

  serviceWorkerOnline: (online) => {
    appManagersManager.isServiceWorkerOnline = online;
  },

  serviceWorkerPort: (payload, source, event) => {
    appManagersManager.onServiceWorkerPort(event);
    port.invokeVoid('receivedServiceMessagePort', undefined, source);
  },

  createObjectURL: (blob) => {
    return URL.createObjectURL(blob);
  },

  setInterval: (timeout) => {
    const intervalId = setInterval(() => {
      port.invokeVoid('intervalCallback', intervalId);
    }, timeout) as any as number;

    return intervalId;
  },

  clearInterval: (intervalId) => {
    clearInterval(intervalId);
  },

  terminate: () => {
    if(typeof(SharedWorkerGlobalScope) !== 'undefined') {
      self.close();
    }
  },

  toggleUsingPasscode: async(payload) => {
    DeferredIsUsingPasscode.resolveDeferred(payload.isUsingPasscode);

    EncryptionPasscodeHashStore.setHashAndSalt(payload.isUsingPasscode ? {
      hash: payload.encryptionHash,
      salt: payload.encryptionSalt
    } : null);

    await Promise.all([
      AppStorage.toggleEncryptedForAll(payload.isUsingPasscode),
      payload.isUsingPasscode ?
        sessionStorage.encryptEncryptable() :
        sessionStorage.decryptEncryptable()
    ]);

    isLocked = false;
  },

  changePasscode: async({toStore, encryptionHash, encryptionSalt}) => {
    await commonStateStorage.set({passcode: toStore});

    EncryptionPasscodeHashStore.setHashAndSalt({hash: encryptionHash, salt: encryptionSalt});
    await Promise.all([
      AppStorage.reEncryptEncrypted(),
      sessionStorage.reEncryptEncryptable()
    ]);
  },

  isLocked: async() => {
    const isUsingPasscode = await DeferredIsUsingPasscode.isUsingPasscode();
    if(isUsingPasscode) return isLocked;

    return false;
  },

  toggleLockOthers: (value, source) => {
    isLocked = value;
    port.invokeExceptSource('toggleLock', value, source);
  },

  saveEncryptionHash: (payload) => {
    EncryptionPasscodeHashStore.setHashAndSalt({hash: payload.encryptionHash, salt: payload.encryptionSalt});
  },

  localStorageEncryptedProxy: (payload) => {
    return sessionStorage.encryptedStorageProxy(payload.type, ...payload.args);
  }

  // localStorageEncryptionMethodsProxy: (payload) => {
  //   return sessionStorage.encryptionMethodsProxy(payload.type, ...payload.args);
  // }

  // socketProxy: (task) => {
  //   const socketTask = task.payload;
  //   const id = socketTask.id;

  //   const socketProxied = socketsProxied.get(id);
  //   if(socketTask.type === 'message') {
  //     socketProxied.dispatchEvent('message', socketTask.payload);
  //   } else if(socketTask.type === 'open') {
  //     socketProxied.dispatchEvent('open');
  //   } else if(socketTask.type === 'close') {
  //     socketProxied.dispatchEvent('close');
  //     socketsProxied.delete(id);
  //   }
  // },
});

log('MTProto start');

appManagersManager.start();
appManagersManager.getManagersByAccount();
appTabsManager.start();

let isFirst = true;

function resetNotificationsCount() {
  commonStateStorage.set({
    notificationsCount: {}
  });
}

listenMessagePort(port, (source) => {
  appTabsManager.addTab(source);
  if(isFirst) {
    isFirst = false;
    resetNotificationsCount();
    // port.invoke('log', 'Shared worker first connection')
  } else {
    callbackify(appManagersManager.getManagersByAccount(), (managers) => {
      for(const key in managers) {
        const accountNumber = key as any as ActiveAccountNumber
        managers[accountNumber].thumbsStorage.mirrorAll(source);
        managers[accountNumber].appPeersManager.mirrorAllPeers(source);
        managers[accountNumber].appMessagesManager.mirrorAllMessages(source);
      }
    });
  }

  // port.invokeVoid('hello', undefined, source);
  // if(!sentHello) {
  //   port.invokeVoid('hello', undefined, source);
  //   sentHello = true;
  // }
}, (source) => {
  appTabsManager.deleteTab(source);
});
