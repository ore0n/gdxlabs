;(function($, $w, $d, _w, _d){
	
	"use strict";
	
	var player = [];
		
	function stopAllVideo(_parent){
		$('.lb-content-video.youtube-video iframe', _parent).each(function(index, element){
			if(player[$(this).attr('id')].getCurrentTime()>0){
				player[$(this).attr('id')].pauseVideo();
			};
		});
		
		$('.lb-content-video.vimeo-video iframe', _parent).each(function(index, element){
			player[$(this).attr('id')].api('pause');
		});
	};
	
	$.cactus_lightbox = function(options){
		
		var $container = $(options.container);
		var _item = options._item;
		var _alias_name = options._alias_name;
		
		$container.each(function(index, element) {
            var $this = $(this);
			var $classControl = $('body');
			
			var html = '';
			
			var id = _alias_name+'lightbox-control-'+index;
			
			html+='<div class="cactus-overlay '+id+'"><div class="svg-loading"><svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="40px" height="40px" viewBox="0 0 50 50" style="enable-background:new 0 0 50 50;" xml:space="preserve"><path fill="#000" d="M43.935,25.145c0-10.318-8.364-18.683-18.683-18.683c-10.318,0-18.683,8.365-18.683,18.683h4.068c0-8.071,6.543-14.615,14.615-14.615c8.072,0,14.615,6.543,14.615,14.615H43.935z" transform="rotate(309.961 25 25)"><animateTransform attributeType="xml" attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.6s" repeatCount="indefinite"></animateTransform></path></svg></div><div class="close-lightbox"><i class="fa fa-times"></i></div></div>';
			html+='<div class="cactus-lightbox '+id+'">';
			html+=		'<a href="javascript:;" class="nav-lightbox ct-lb-prev"><i class="fa fa-chevron-left"></i></a>';
			html+=		'<a href="javascript:;" class="nav-lightbox ct-lb-next"><i class="fa fa-chevron-right"></i></a>';
			html+=		'';	
			html+='</div>';
			
			$classControl.append(html);
			
			var $new_overlay_id = $('.cactus-overlay.'+id);
			var $new_lightbox_id = $('.cactus-lightbox.'+id);
			
			var $lightbox_prev = $('.ct-lb-prev', $new_lightbox_id);
			var $lightbox_next = $('.ct-lb-next', $new_lightbox_id);			
			
			$this.on('click', _item, function(event){
				
				var $this_item = $(this);
				
				var data_source 	= $this_item.attr('data-source'),
					data_type		= $this_item.attr('data-type'),
					data_caption	= $this_item.attr('data-caption');
				
				var html_item = '';	
				
				/*$this.find(_item).each(function(index, element){					
					var id_item = 'lightbox-item-'+index;	
					$(this).attr('data-action', id_item);
					
					if($('.'+id_item, $new_lightbox_id).length==0){					
						html_item+='<div class="lightbox-item '+id_item+'" data-action="'+id_item+'">';
						html_item+=	'<div class="lightbox-item-content">';
						html_item+=		'<div class="number-slider"></div>';	
						html_item+=		'<div class="top-content">';
						html_item+=		'</div>';
						html_item+=		'<div class="bottom-content">';
						html_item+=		'</div>';
						html_item+=	'</div>';
						html_item+='</div>';						
					};
					                   
                });*/
				
				var id_item = 'lightbox-item-0';	
				$(this).attr('data-action', id_item);
					
				if($('.'+id_item, $new_lightbox_id).length==0){					
					html_item+='<div class="lightbox-item '+id_item+'" data-action="'+id_item+'">';
					html_item+=	'<div class="lightbox-item-content">';
					html_item+=		'<div class="number-slider"></div>';					
					html_item+=		'<div class="top-content">';
					html_item+=		'</div>';
					html_item+=		'<div class="bottom-content">';
					html_item+=		'</div>';
					html_item+=	'</div>';
					html_item+='</div>';						
				};
				
				$new_lightbox_id.append(html_item);
				
				var $this_item_top_content = $('.'+$this_item.attr('data-action')+' .top-content', $new_lightbox_id);
				var $this_item_bottom_content = $('.'+$this_item.attr('data-action')+' .bottom-content', $new_lightbox_id);
				var $items_content = $('.lightbox-item', $new_lightbox_id);
				var $this_item_content = $('.lightbox-item.'+$this_item.attr('data-action'), $new_lightbox_id);
				
				$new_overlay_id.addClass('active-lightbox');
				$items_content.removeClass('show-content');
				$this_item_content.addClass('show-content');
				$new_lightbox_id.addClass('active-lightbox');
				
				$('.lightbox-item-content .number-slider', $new_lightbox_id).html(($('.lightbox-item', $new_lightbox_id).index($('.show-content',$new_lightbox_id))+1)+'/'+($this.find(_item).length));		
				
				var contentID = id+$this_item.attr('data-action');
				
				//stopAllVideo($new_lightbox_id);
				
				switch(data_type){
					case 'image':
						
						$this_item_top_content.html('<div class="lb-content-img"><img src="'+data_source+'"><div>');
						$this_item_bottom_content.html(data_caption);
						
						$('<img src="'+data_source+'">').on('load', function(){							
							setTimeout(function(){
								$this_item_content.addClass('opacity-100');
							},50);							
						});
						
						break;
					case 'iframe-video':
						
						var $videoinline = $this_item.attr('data-id');					
										
						if(typeof($videoinline)!='undefined' && $videoinline!='' && typeof(video_iframe_params[$videoinline])=='object'){
							$this_item_top_content.html('<div class="lb-content-video">'+video_iframe_params[$videoinline][0]+'<div>');							
						};
						
						$this_item_bottom_content.html(data_caption);
											
						setTimeout(function(){
							$this_item_content.addClass('opacity-100');
						},50);
						
						break;	
					/*	
					case 'youtube':	
						if($.trim($this_item_top_content.html())==''){													
							$this_item_top_content.html(								
								'<div class="lb-content-video youtube-video"><div id="'+contentID+'"></div></div>'
							);

							player[contentID] = new YT.Player(contentID, {
								videoId: data_source,
								events: {
									'onReady': function(){
										$this_item_content.addClass('opacity-100');	
									},										
								}
							});							
						};
											
						break;
					case 'vimeo':
						if($.trim($this_item_top_content.html())==''){						
							$this_item_top_content.html(
								'<div class="lb-content-video vimeo-video">'+
									'<iframe id="'+contentID+'" src="https://player.vimeo.com/video/'+data_source+'?api=1&player_id='+contentID+'" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe>'+
								'</div>'
							);	
						};
						
						var vimeo_iframe = $('#'+contentID)[0];
						player[contentID] = $f(vimeo_iframe);
												
						player[contentID].addEvent('ready', function(){
							$this_item_content.addClass('opacity-100');
						});
												
						break;	
					*/		
				};	
				
				event.stopPropagation();
				return false;			
				
			});
			
			$lightbox_next.on('click', function(){
				var $nextItem = $('.lightbox-item.show-content', $new_lightbox_id).next('.lightbox-item');
				if($nextItem.length==0){$nextItem=$('.lightbox-item[data-action="lightbox-item-0"]', $new_lightbox_id);};			
				$('[data-action="'+$nextItem.attr('data-action')+'"]', $this).trigger('click');
			});
			
			$lightbox_prev.on('click', function(){
				var $prevItem = $('.lightbox-item.show-content', $new_lightbox_id).prev('.lightbox-item');
				if($prevItem.length==0){$prevItem=$('.lightbox-item:last-child', $new_lightbox_id);};			
				$('[data-action="'+$prevItem.attr('data-action')+'"]', $this).trigger('click');
			});
			
			$new_overlay_id.on('click', function(){
				$new_overlay_id.removeClass('active-lightbox');
				$new_lightbox_id.removeClass('active-lightbox');
				$('.lightbox-item', $new_lightbox_id).removeClass('show-content');				
				$new_lightbox_id.find('.lightbox-item').remove('');
				//stopAllVideo($container);
			});
			
        });
	};
	$d.ready(function(e) {
		$.cactus_lightbox({
			container	: 'body',
			_item		: '.lightbox_item',
			_alias_name : 'var1',			
		});
	});
}(jQuery, jQuery(window), jQuery(document), window, document));