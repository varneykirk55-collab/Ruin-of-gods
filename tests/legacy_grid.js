'use strict';
const {N}=require('../src/sim');
const index=i=>Math.floor(i/160)*N+i%160;
const buildings=bs=>bs.map(b=>({...b,cells:b.cells.map(index)}));
const grid=a=>{const out=[];for(let z=0;z<a.length/N;z++)out.push(...a.slice(z*N,z*N+160));return out;};
module.exports={index,buildings,grid};
