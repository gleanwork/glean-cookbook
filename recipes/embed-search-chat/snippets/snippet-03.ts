import { renderChat } from '@gleanwork/web-sdk';

renderChat(containerElement, {
  backend: 'https://{your}-be.glean.com',
  webAppUrl: 'https://{your}.glean.com',
  authMethod: 'sso',
  initialMessage: "What's our PTO policy?",
});
