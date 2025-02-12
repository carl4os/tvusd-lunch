/*
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

// sets up dependencies
const Alexa = require('ask-sdk-core');
const i18n = require('i18next');
const sprintf = require('i18next-sprintf-postprocessor');
/* personalization Utility */
const { fetchTvusdLunchData } = require('./tvusd-lunch-client');
const { getMenuIdFromRedirect } = require('./tvusd-lunch-client');
const { needMenuRequest } = require('./tvusd-lunch-client');

/**
 * Core functionality for TVUSD lunch skill
 * 
 * Gets lunch menu based on LunchDate value
 * Else if LunchDate value not passed get lunch for today
*/
const GetTVUSDLunchHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    // checks request type
    return request.type === 'LaunchRequest'
      || (request.type === 'IntentRequest'
        && request.intent.name === 'GetLunchIntent');
  },
  async handle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    var dateValue = await getDate(handlerInput, requestAttributes);
    console.log("Date value:", dateValue);
    var speakOutput;
    
    try {
        var menuId = '';
        if (needMenuRequest())
            menuId = await getMenuIdFromRedirect();
        console.log("MenuId is needed:", dateValue);
        const uniqueMeals = await fetchTvusdLunchData(menuId);
        console.log("Unique meal count:", uniqueMeals.length);
        const selectedDate = getFormattedDate(dateValue);
        console.log("Search meal date:", selectedDate);
        const lunchForDate = uniqueMeals.find(meal => meal.date === selectedDate);
        
        if (lunchForDate) {
            console.log("meal found:", lunchForDate);
            speakOutput = Alexa.escapeXmlCharacters(lunchForDate.meal);
        } else {
            speakOutput = `No lunch found for ${dateValue}`;
        }
    }
    catch (error) {
        console.error("Error fetching menu data:", error);
    }

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(requestAttributes.t('HELP_REPROMPT'))
      .withSimpleCard(requestAttributes.t('SKILL_NAME', requestAttributes.t(dateValue)), speakOutput)
      .getResponse();
  },
};

function getFormattedDate(dateValue) {
  const tomorrow = new Date(dateValue);

  const month = String(tomorrow.getMonth()).padStart(2, "0");
  const day = String(tomorrow.getDate()).padStart(2, "0");
  const year = tomorrow.getFullYear();

  return `${year}-${month}-${day}`;
}

/**
 * 
 * Get date from intent else return default today
 * 
 * @param handlerInput 
 * @returns 
 */
const getDate = async function (handlerInput, requestAttributes) {
  const currentIntent = handlerInput.requestEnvelope.request.intent;
  if (currentIntent && currentIntent.slots.dateFormat && currentIntent.slots.dateFormat.value) {
    console.log("inside dateFormat " + currentIntent.slots.dateFormat.value)
    return currentIntent.slots.dateFormat.value;
  }
  return new Date().toString();
}

const HelpHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest'
      && request.intent.name === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    return handlerInput.responseBuilder
      .speak(requestAttributes.t('HELP_MESSAGE'))
      .reprompt(requestAttributes.t('HELP_REPROMPT'))
      .getResponse();
  },
};

const FallbackHandler = {
  // The FallbackIntent can only be sent in those locales which support it,
  // so this handler will always be skipped in locales where it is not supported.
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest'
      && request.intent.name === 'AMAZON.FallbackIntent';
  },
  handle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    return handlerInput.responseBuilder
      .speak(requestAttributes.t("I'm sorry, I don't know how to help with that"))
      .reprompt(requestAttributes.t('Can you say that again?'))
      .getResponse();
  },
};

const ExitHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest'
      && (request.intent.name === 'AMAZON.CancelIntent'
        || request.intent.name === 'AMAZON.StopIntent');
  },
  handle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    return handlerInput.responseBuilder
      .speak(requestAttributes.t('Come back again soon'))
      .getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);
    return handlerInput.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.log(`Error handled: ${error.message}`);
    console.log(`Error stack: ${error.stack}`);
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    return handlerInput.responseBuilder
      .speak(requestAttributes.t('I just lost your lunch.'))
      .reprompt(requestAttributes.t('Would you like to try again?'))
      .getResponse();
  },
};

const LocalizationInterceptor = {
  process(handlerInput) {
    const localizationClient = i18n.use(sprintf).init({
      lng: handlerInput.requestEnvelope.request.locale,
      fallbackLng: 'en', // fallback to EN if locale doesn't exist
    });

    localizationClient.localize = function () {
      const args = arguments;
      let values = [];

      for (var i = 1; i < args.length; i++) {
        values.push(args[i]);
      }
      const value = i18n.t(args[0], {
        returnObjects: true,
        postProcess: 'sprintf',
        sprintf: values
      });

      if (Array.isArray(value)) {
        return value[Math.floor(Math.random() * value.length)];
      } else {
        return value;
      }
    }

    const attributes = handlerInput.attributesManager.getRequestAttributes();
    attributes.t = function (...args) { // pass on arguments to the localizationClient
      return localizationClient.localize(...args);
    };
  },
};

const skillBuilder = Alexa.SkillBuilders.custom();

exports.handler = skillBuilder
  .addRequestHandlers(
    GetTVUSDLunchHandler,
    HelpHandler,
    ExitHandler,
    FallbackHandler,
    SessionEndedRequestHandler
  )
  .addRequestInterceptors(LocalizationInterceptor)
  .addErrorHandlers(ErrorHandler)
  .withCustomUserAgent('sample/basic-fact/v2')
  .lambda();
