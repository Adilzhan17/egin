import express from 'express';
import { createApp } from '../src/server.mjs';
const {app}=createApp({dataDir:process.env.DATA_DIR||'/tmp/egin-preview-data',origins:['http://localhost:4935'],rpID:'localhost'});
app.use(express.static('../mobile/dist',{dotfiles:'allow'}));
app.get('/',(req,res)=>res.sendFile('index.html',{root:'../mobile/dist'}));
app.listen(4935,'0.0.0.0',()=>console.log('Preview ready on localhost:4935'));
