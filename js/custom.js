// Scriptaculous Toggle
function s_toggle(id,style){
	if (style==1)
	new Effect.toggle(id, 'appear');
	else
	new Effect.toggle(id, 'blind', { duration: 0.5 });
}



function ajax(page, objID, loadObj, getOrPost, str){
	
	// get XMLHttp Object:
	
	var xmlhttp=false; //Clear our fetching variable
	try {
		xmlhttp = new ActiveXObject('Msxml2.XMLHTTP'); //Try the first kind of active x object?
	} catch (e) {
		try {
			xmlhttp = new ActiveXObject('Microsoft.XMLHTTP'); //Try the second kind of active x object
		} catch (E) {
			xmlhttp = false;
		}
	}
	
	if (!xmlhttp && typeof XMLHttpRequest!='undefined') {
		xmlhttp = new XMLHttpRequest(); //If we were able to get a working active x object, start an XMLHttpRequest
	}
	
	// Process Ajax:
	obj=document.getElementById(objID); // Object where retrieved content will display.
	
	if (loadObj!=='0') {
		obj.innerHTML='<div id="'+loadObj+'">&nbsp;</div>'; // Start Loading...
	}
	
	var file = '/assets/php/'+page; // Server Page
	
	if (getOrPost == "get"){
		xmlhttp.open('GET', file+str , true); //Open the file through GET, and add the page we want to retrieve as a GET variable **
		
		xmlhttp.onreadystatechange=function() {
			if (xmlhttp.readyState==4 && xmlhttp.status == 200) { //Check if it is ready to recieve data
				var content = xmlhttp.responseText; //The content data which has been retrieved ***
				if( content ){ //Make sure there is something in the content variable
					obj.innerHTML = content; //Change the inner content of your div to the newly retrieved content ****
				}
			}
		}
		xmlhttp.send(null); //Nullify the XMLHttpRequest
		
	} else {

		xmlhttp.open('POST', file, true);
		xmlhttp.setRequestHeader('Content-Type','application/x-www-form-urlencoded; charset=UTF-8');
		
		xmlhttp.onreadystatechange=function() {
			if (xmlhttp.readyState==4 && xmlhttp.status == 200) { //Check if it is ready to recieve data
				var content = xmlhttp.responseText; //The content data which has been retrieved ***
				if( content ){ //Make sure there is something in the content variable
					obj.innerHTML = content; //Change the inner content of your div to the newly retrieved content ****
				}
			}
		}
		xmlhttp.send(str);
	}
}

// Used in submitform() to get form objects
function getformvalues (fobj){
	fobj=$(fobj);
	var str='';
	
	// run through list of objects in form and create var string.
	for (var i=0; i<fobj.elements.length; i++){
	
		if (fobj.elements[i].type == 'checkbox'){
		
			if (fobj.elements[i].checked==true){
		
				str += fobj.elements[i].name + '=1&';
			
			} else {
		
				str += fobj.elements[i].name + '=0&';
			
			}
			
		} else {
		
			str += fobj.elements[i].name + '=' + escape(fobj.elements[i].value) + '&';
			
		}
	}
	return str;
}

// Submits form with ajax()
function submitform (page, obj, loadObj, theform){
	var str=getformvalues(theform);
	ajax(page, obj, loadObj, "post", str);
}