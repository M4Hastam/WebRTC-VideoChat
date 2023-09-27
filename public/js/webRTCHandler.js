import * as wss from './wss.js';
import * as ui from './ui.js';
import * as constants from './constants.js';
import * as store from './store.js';


let connectedUserDetails;
let peerConnection;
let dataChannel;

const configuration = {
       iceServers: [
              {
                     urls: 'stun:stun.l.google.com:13902'
              },
            
       ]
}

const defaultConstraints ={
       audio : true,
       video : true
}

export const getLocalPreview = ()=>{

      try{
       navigator.mediaDevices
       .getUserMedia(defaultConstraints)
       .then((stream)=>{
       ui.updateLocalVideo(stream); 
       ui.showVideoCallButtons();
       store.setCallState(constants.callState.CALL_AVAILABLE);     
       store.setLocalStream(stream);
       });
       }catch(err){
       console.log('error get camera ..');
       }
};

const createPeerConnection = ()=>{
       peerConnection = new RTCPeerConnection(configuration);

       dataChannel = peerConnection.createDataChannel('chat');

       peerConnection.ondatachannel = (event) =>{
              const dataChannel = event.channel;

              dataChannel.onopen = ()=>{
                     console.log('peer connections is ready to receive data channel messages');
              }
       
              dataChannel.onmessage = (event)=>{
                     const message =  JSON.parse(event.data);
                     ui.appendMessage(message)
              }

       }

      

       peerConnection.onicecandidate = (event)=>{
              console.log('geeting ice candidates from stun server');
              if(event.candidate){
                     // send our ice candidates to other peer ..
                     wss.sendDataUsingWebRTCSignaling({
                            connectedUserSocketId : connectedUserDetails.socketId,
                            type : constants.webRTCSignaling.ICE_CANDIDATE,
                            candidate : event.candidate
                     });
              }
       }


       // receiving tracks ..

       const remoteStream  = new MediaStream();
       store.setRemoteStream(remoteStream);
       ui.updateRemoteVideo(remoteStream);

       peerConnection.ontrack = (event)=>{
              remoteStream.addTrack(event.track);
       }


       // add our stream to peer connection

       if(connectedUserDetails.callType === constants.callType.VIDEO_PERSONAL_CODE ||
          connectedUserDetails.callType === constants.callType.VIDEO_STRANGER){
              const localStream = store.getState().localStream;

              // localStream.getTracks().forEach(track => {
              //        peerConnection.addTrack(track, localStream);
              // });

              for(const track of localStream.getTracks()){
                     peerConnection.addTrack(track, localStream);
              }
       }
}


export const sendMessageUsingDataChannel = (message)=>{
       const stringifiedMessage = JSON.stringify(message);
       dataChannel.send(stringifiedMessage);
}

export const sendPreOffer = (callType, calleePersonalCode)=>{
       const data = {
        callType,
        calleePersonalCode
       }

       connectedUserDetails = {
              callType,
              socketId : calleePersonalCode
       }

       if(callType === constants.callType.CHAT_PERSONAL_CODE ||
          callType === constants.callType.VIDEO_PERSONAL_CODE){

              ui.showCallingDialog(callingDialogRejectCallHandler);
              store.setCallState(constants.callState.CALL_UNAVAILABLE);
              wss.sendPreOffer(data);
       }

       if(callType === constants.callType.CHAT_STRANGER ||
          callType === constants.callType.VIDEO_STRANGER){

              store.setCallState(constants.callState.CALL_UNAVAILABLE);
              wss.sendPreOffer(data);
          }
}

export const handlePreOffer = (data) =>{
       
     const { callType, callerSocketId } = data;

     if(!checkCallPossibility(callType)){
       return sendPreOfferAnswer(constants.preOfferAnswer.CALL_UNAVAILABLE, callerSocketId);
     }

     store.setCallState(constants.callState.CALL_UNAVAILABLE);
       
     connectedUserDetails = {
       socketId : callerSocketId,
       callType
     }

     if(callType === constants.callType.CHAT_PERSONAL_CODE ||
        callType === constants.callType.VIDEO_PERSONAL_CODE){

     ui.showIncomingCallDialog(callType, acceptCallHandler, rejectCallHandler);
       }

       if(callType === constants.callType.CHAT_STRANGER ||
          callType === constants.callType.VIDEO_STRANGER){

              createPeerConnection();
              sendPreOfferAnswer(constants.preOfferAnswer.CALL_ACCEPTED);
              ui.showCallElements(connectedUserDetails.callType);

              }
}


const acceptCallHandler = ()=>{
       console.log('call accepted');
       createPeerConnection();
       sendPreOfferAnswer(constants.preOfferAnswer.CALL_ACCEPTED);
       ui.showCallElements(connectedUserDetails.callType);
}

const rejectCallHandler = ()=>{
       console.log('call rejected');
       setIncomingCallsAvailable();
       sendPreOfferAnswer(constants.preOfferAnswer.CALL_REJECTED);
}

const callingDialogRejectCallHandler = ()=>{
       const data = {
              connectedUserSocketId : connectedUserDetails.socketId
       }
       closePeerConnectionAndResetState();

       wss.sendUserHangUp(data);
}


const sendPreOfferAnswer = (preOfferAnswer, callerSocketId = null)=>{
       const socketId = callerSocketId ? callerSocketId : connectedUserDetails.socketId
       const data = {
              callerSocketId : socketId,
              preOfferAnswer
       }
       ui.removeAllDialogs();
       wss.sendPreOfferAnswer(data);
}

export const handlePreOfferAnswer = (data)=>{
       const { preOfferAnswer } = data;
       
       ui.removeAllDialogs();

       if(preOfferAnswer === constants.preOfferAnswer.CALLEE_NOT_FOUND){
              setIncomingCallsAvailable();
              ui.showInfoDialog(preOfferAnswer);
       }
       if(preOfferAnswer === constants.preOfferAnswer.CALL_UNAVAILABLE){
              setIncomingCallsAvailable();
              ui.showInfoDialog(preOfferAnswer);
       }
       if(preOfferAnswer === constants.preOfferAnswer.CALL_REJECTED){
              setIncomingCallsAvailable();
              ui.showInfoDialog(preOfferAnswer);
       }
       if(preOfferAnswer === constants.preOfferAnswer.CALL_ACCEPTED){
              ui.showCallElements(connectedUserDetails.callType);
              createPeerConnection();
              sendWebRTCOffer();

              // send webRTC offer
       }
}

const sendWebRTCOffer = async ()=>{
       const offer = await peerConnection.createOffer();
       await peerConnection.setLocalDescription(offer);
       wss.sendDataUsingWebRTCSignaling({
              connectedUserSocketId : connectedUserDetails.socketId,
              type : constants.webRTCSignaling.OFFER,
              offer : offer
       })
}

export const handleWebRTCOffer = async (data)=>{
      await peerConnection.setRemoteDescription(data.offer);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      wss.sendDataUsingWebRTCSignaling({
              connectedUserSocketId : connectedUserDetails.socketId,
              type: constants.webRTCSignaling.ANSWER,
              answer: answer
      })
}

export const handleWebRTCAnswer = async (data) =>{
       console.log('handling webRTC Answer');
       await peerConnection.setRemoteDescription(data.answer);
}


export const handleWebRTCCandidate = async (data) =>{
       try {
              await peerConnection.addIceCandidate(data.candidate);
       } catch (err){
              console.log('error occured when trying to add receiving ice candidate');
              console.log(err);
       }
}

let screenSharingStream;

export const switchBetweenCameraAndScreenSharing = async (screenSharingActive) =>{
       if(screenSharingActive){
              
              const localStream = store.getState().localStream;
              const senders = peerConnection.getSenders();


              const sender = senders.find((sender)=>{
                     return sender.track.kind === localStream.getVideoTracks()[0].kind;
              });

              if(sender){
                     sender.replaceTrack(localStream.getVideoTracks()[0]);
              }

              // stop screen sharing stream ..

              store.getState()
              .screenSharingStream.getTracks()
              .forEach(track => {
                     track.stop();  
              });

              store.setScreenSharingActive(!screenSharingActive);

              ui.updateLocalVideo(localStream);

       } else {
            console.log('switching for srceen sharing');
            
            try {
              screenSharingStream = await navigator.mediaDevices.getDisplayMedia({
                     video : true
              });
              store.setScreenSharingStream(screenSharingStream);

              // replace track witch sender ..

              const senders = peerConnection.getSenders();

              const sender = senders.find((sender)=>{
                     return sender.track.kind === screenSharingStream.getVideoTracks()[0].kind;
              });

              if(sender){
                     sender.replaceTrack(screenSharingStream.getVideoTracks()[0]);
              }

              store.setScreenSharingActive(!screenSharingActive);

              ui.updateLocalVideo(screenSharingStream);
            } catch (err) {
              console.log('error occured when tring to get screen sharing stream ..');;
            }

       }
}

// hang up ..


export const handleHangUp = ()=>{

       const data = {
              connectedUserSocketId : connectedUserDetails.socketId,
       }

       wss.sendUserHangUp(data);
       closePeerConnectionAndResetState();
}

export const handleConnectedUserHangedUp = ()=>{

       closePeerConnectionAndResetState();
       
}

const closePeerConnectionAndResetState = ()=>{
       if(peerConnection){
              peerConnection.close();
              peerConnection = null;
       }

       // active mic and camera ..

       if(connectedUserDetails.callType === constants.callType.VIDEO_PERSONAL_CODE 
       || connectedUserDetails.callType === constants.callType.VIDEO_STRANGER){

              store.getState().localStream.getVideoTracks()[0].enabled = true;
              store.getState().localStream.getAudioTracks()[0].enabled = true;
       }

       ui.updateUiAfterHangUp(connectedUserDetails.callType)
       setIncomingCallsAvailable();
       connectedUserDetails = null;
};


const checkCallPossibility = (callType) =>{
       const callState = store.getState().callState;

       if(callState === constants.callState.CALL_AVAILABLE){
              return true;
       }

       if((callType === constants.callType.VIDEO_PERSONAL_CODE ||
          callType === constants.callType.VIDEO_STRANGER) &&
          callState === constants.callState.CALL_AVAILABLE_ONLY_CHAT){
              return false;
       }

       if((callType === constants.callType.CHAT_PERSONAL_CODE ||
          callType === constants.callType.CHAT_STRANGER) &&
          callState === constants.callState.CALL_AVAILABLE_ONLY_CHAT){
              return true;
          }
}

const setIncomingCallsAvailable = ()=>{
       const localStream = store.getState().localStream;
       if(localStream){
              store.setCallState(constants.callState.CALL_AVAILABLE);
       }else{
              store.setCallState(constants.callState.CALL_AVAILABLE_ONLY_CHAT);
       }
}