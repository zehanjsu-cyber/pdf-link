import {download} from './resolve.js';
export default function onRequest({request}){return download(request)}
