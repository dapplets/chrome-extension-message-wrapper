import {
  CHROME_EXT_TOOLKIT,
  INVOKE_FUNCTION,
  GET_FUNCTION_NAMES
} from "./constants";

import { isFunction, isObject, isPromise, Logger } from "./utils";

/**
 * A small helper which is used to get variables in deeply nested objects.
 *
 * @param {Object} object
 * @param {Array} path The path to the variable inside the object
 * @return {*} Returns either an object, function or undefined depending on the path.
 */
export const find = (object, path) => {
  if (path.length > 0) {
    let ret = object[path[0]];
    if (isObject(ret)) {
      ret = find(ret, path.slice(1));
    } else if (path.slice(1).length > 0) {
      return undefined;
    }
    return ret;
  }

  return object;
};

/**
 * Calls a function from the background functions, based on the request.
 * @param {Object} request
 * @param {Object} sender
 * @param {Function} sendResponse
 * @param {Object} backgroundFunctions
 * @returns {Boolean} true if the message channel should be kept open (async function) or false if it is a sync function.
 */
export const invokeFunction = (req, sender, bgFuncs) => {
  if (find(bgFuncs, req.payload.path)) {
    let ret = find(bgFuncs, req.payload.path);
    if (isFunction(ret)) {
      try {
        ret = ret(...req.payload.args, {
          request: req,
          sender
        });
      } catch (error) {
        return Promise.resolve({ error: error.message });
      }
      // If it is a promise (async function) keep the message channel open by returning true and send the reponse after resolving.
      if (isPromise(ret)) {
        return ret.then(result => ({ result: result })).catch(error => ({ error: error.message }));
      }
    }
    return Promise.resolve({ result: ret });
  }
  return;
};

/**
 * Uses the background functions to create an object with the same structure,
 * only with names of the functions instead of the functions themself.
 *
 * @param {Object} obj Functions inside an object
 */
export const mapNames = obj =>
  Object.keys(obj).reduce((acc, key) => {
    let ret = key;
    if (isObject(obj[key])) {
      ret = mapNames(obj[key]);
    }
    return { ...acc, [key]: ret };
  }, {});

/**
 * Function which creates the message listener.
 * This should be passend in chrome.runtime.onMessage.addListener
 *
 * @param {Object} bgFuncs Functions which should be available to the content/popup scripts
 * @param {Object} options Options to configure logging, custom message handling etc.
 * @returns {Function} listener which takes Request, Sender and SendResponse
 */
const setupMessageListener = (bgFuncs = {}, options = {}) => {
  const logger = Logger(options);
  const mappedBackgroundFunctions = mapNames(bgFuncs);
  return (req, sender) => {
    if (req.handler === CHROME_EXT_TOOLKIT) {
      switch (req.type) {
        case GET_FUNCTION_NAMES:
          return Promise.resolve({
            result: mappedBackgroundFunctions
          });
        case INVOKE_FUNCTION:
          logger.logRequest(req);
          return invokeFunction(req, sender, bgFuncs);
        default:
          return;
      }
    } else if (options.customHandler) {
      return options.customHandler(req, sender);
    }
  };
};

export default setupMessageListener;
