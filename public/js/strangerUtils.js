import * as wss from './wss.js';
import * as webRTCHandler from './webRTCHandler.js';
import * as ui from './ui.js';

let strangerCallType;

export const changeStrangerConnectionStatus = (status)=>{
    const data = { status };

    wss.changeStrangerConnectionsStatus(data);

}

export const getStrangerSocketIdAndConnect = (callType) =>{
        strangerCallType = callType;
        wss.getStrangerSocketId();
};

export const connectWithStranger = (data)=>{
    console.log(data.randomStrangerSocketId);

    if(data.randomStrangerSocketId){
        webRTCHandler.sendPreOffer(strangerCallType, data.randomStrangerSocketId);
    } else {
       ui.showNoStrangerAvailableDialog();
    }
}