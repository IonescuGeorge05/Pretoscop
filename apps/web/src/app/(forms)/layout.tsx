/**
 * Same public layout as `(site)`, but without its `loading.tsx` boundary. Dynamic pages under a
 * loading boundary are streamed into a hidden container that only JavaScript reveals; pages here
 * (the contact form, the DSA point of contact) must render completely for visitors without
 * JavaScript too.
 */
export { default } from '../(site)/layout';
