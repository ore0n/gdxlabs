;(function($, $w, $d, _w, _d){
	"user strict";
	function isNumber(n) {return !isNaN(parseFloat(n)) && isFinite(n);};
	
	/*smart content box*/
	$.ct_contentbox = function(options){
		var $elms = options.elms;
		$elms.each(function(index, element) {			
			var $this = $(this);
			
			if($this.find('.tab-control').length>0){
				$this.find('.tab-control').addClass('nav-wrapper-'+index);
				var $widthMaxnav = $('.control-header .block-title', $this).width() + $('.control-header .prev-next-slider', $this).width() + $('.control-header .bt-action', $this).width() + 85;
				$('<style>.nav-wrapper-'+index+'{min-width:calc(100% - '+$widthMaxnav+'px); min-width:-webkit-calc(100% - '+$widthMaxnav+'px); min-width:-ms-calc(100% - '+$widthMaxnav+'px); min-width:-moz-calc(100% - '+$widthMaxnav+'px);}</style>').appendTo('head');
				var nav = priorityNav.init({
					mainNavWrapper				: '.nav-wrapper-'+index,
					mainNav						: '.nav-ul',
					navDropdownLabel			: '<a href="javascript:;"><span></span><span></span><span></span>a</a>',
					navDropdownBreakpointLabel	: '<a href="javascript:;"><span></span><span></span><span></span>a</a>',
					navDropdownClassName		: 'nav__dropdown',
					navDropdownToggleClassName	: 'nav__dropdown-toggle',					
				});				
			};
			
			var ajax_url, 
				$data_shortcode, 
				$data_paged, 
				$data_total_pages, 
				$data_filter, 
				$data_query,
				$data_query_class,
				$data_send_to_server, 
				$data_send_to_server_1, 
				visFilter = [],
				$elm_prev=$('.control-prev', $this), 
				$elm_next=$('.control-next', $this), 
				$elm_filter=$('.filter_item', $this),
				$elm_filter_dd=$('.view-sortby', $this), 
				checkPagedData,
				clickEvent = false;
			
			function renew_data(dsho, dtot, dfil, dque, dquc){
				//$this.attr('data-shortcode', dsho);				
				$this.attr('data-total-pages', dtot);				
				$this.attr('data-filter', dfil);
				//$this.attr('data-query', dque);
				$this.attr('data-query-class', dquc)
			};	
			
			function reset_data(){
				ajax_url 			= $this.attr('data-url');
				$data_shortcode 	= $this.attr('data-shortcode');				
				$data_total_pages	= parseInt($.trim($this.attr('data-total-pages')));				
				$data_filter		= $this.attr('data-filter');
				$data_query 		= $this.attr('data-query');
				$data_query_class	= $this.attr('data-query-class');
				
				$data_paged			= 1;
				checkPagedData		= $data_paged;
			};
			
			function checkPagedClick(pon){
				if(pon=='next'){
					if($data_paged==$data_total_pages){
						//last page
						return;
					};					
					checkPagedData=$data_paged+1;
				}else if(pon=='prev'){
					if($data_paged==1){
						//first page
						return;
					};
					checkPagedData=$data_paged-1;														
				}else{
					checkPagedData=$data_paged;
				};
				
				if(checkPagedData==$data_total_pages){
					//last page
					$elm_next.addClass('no-click');					
				}else{
					$elm_next.removeClass('no-click');	
				};
				
				if(checkPagedData==1){
					//first page						
					$elm_prev.addClass('no-click');						
				}else{
					$elm_prev.removeClass('no-click');
				};
			};
			
			function disableAllBtn(){
				$elm_prev.addClass('no-click');
				$elm_next.addClass('no-click');
				$elm_filter_dd.addClass('no-click');
				$elm_filter.addClass('no-click');
			}
			
			function enableAllBtn(){
				$elm_filter_dd.removeClass('no-click');
				$elm_filter.removeClass('no-click');
			}
			
			function ajax_posts(pon){
								
				checkPagedClick(pon);
				
				$data_send_to_server = {
					'dataShortcode':$data_shortcode, 
					'dataFilter':$data_filter, 
					'dataQuery':$data_query,
					'page':checkPagedData,
					'dataQueryClass':$data_query_class,
					'action':'cactusContentBlockdata',
				};
				
				var $this_container_ajax = 	$('.ajax-container', $this);
				var $this_container_ajax_cr_paged = $('.ajax-container[data-filter="'+$data_filter+'"]', $this);
				var $this_container_ajax_filter;
				
				if($this_container_ajax_cr_paged.eq(checkPagedData-1).length>0){
					
					$this_container_ajax_filter = $('.ajax-container[data-filter="'+$data_filter+'"][data-paged="'+checkPagedData+'"]', $this);
					$this_container_ajax.hide();
					$this_container_ajax_filter.show();
					setTimeout(function(){
						$this.removeClass('loading-control');
						$this_container_ajax.removeClass('active');
						$this_container_ajax_cr_paged.removeClass('tab-active');
						$this_container_ajax_filter.addClass('active tab-active');
						enableAllBtn();
					},50);
					$data_paged = checkPagedData;	
					clickEvent=false;				
					return;					
				}else{	
					var oldHeight = $this.outerHeight(true);
					$this.css({'min-height':oldHeight})			
					$.ajax({
						url:		ajax_url,						
						type: 		'POST',
						data:		$data_send_to_server,
						dataType: 	'html',
						beforeSend: function(){
							$this.addClass('loading-control');
						},
						success: 	function(data){
							//if(data=='0' || data==''){
								//console.log('abc')								
							//}else{	
																					
								$this.append(data);
								$this_container_ajax_filter = $('.ajax-container[data-filter="'+$data_filter+'"][data-paged="'+checkPagedData+'"]', $this);	
																													
								$this_container_ajax.hide();
								$this_container_ajax_filter.show();	
								
								setTimeout(function(){
									$this.removeClass('loading-control');
									$this_container_ajax.removeClass('active');
									$this_container_ajax_cr_paged.removeClass('tab-active');
									$this_container_ajax_filter.addClass('active tab-active');
									if($('.nav__dropdown-toggle',$this).length>0 && $('.nav__dropdown-toggle',$this).hasClass('is-open')){
										$('.nav__dropdown-toggle').trigger('click');
									}
									enableAllBtn();	
									$data_paged = checkPagedData;
									clickEvent=false;
									if(data=='0' || data==''){
										$elm_prev.addClass('no-click');
										$elm_next.addClass('no-click');
									}
									$this.removeAttr('style');
								},350);
								
								if(typeof(lazySizes)!='undefined'){
									lazySizes.init();
								};
								
							//};
						},
						error:		function( jqXHR, textStatus, errorThrown){		
							/*console.log(jqXHR.responseText)*/					
						},
					});
				};
			};
			
			reset_data();	
			
			visFilter[$data_filter] = {
				dataShortcode:$data_shortcode, 
				dataTotalPages:$data_total_pages, 				
				dataFilter:$data_filter, 
				dataQuery:$data_query,
				dataQueryClass:$data_query_class,
			};
			
			checkPagedClick('');
			
			$elm_prev.off('.prev-page-scb').on('click.prev-page-scb', function(){
				if(clickEvent){/*console.log('loading...');*/return false;}
				clickEvent=true;
				
				ajax_posts('prev');
				return false;
			});
			
			$elm_next.off('.next-page-scb').on('click.next-page-scb', function(){
				if(clickEvent){/*console.log('loading...');*/return false;}
				clickEvent=true;
				
				ajax_posts('next');
				return false;
			});
			
			$elm_filter.off('.click-filter').on('click.click-filter', function(){				
				
				if(clickEvent){/*console.log('loading...');*/return false;}
				clickEvent=true;
				
				var $this_filter = $(this);
				var $this_data_filter = $this_filter.attr('data-filter');
				var $this_data_query_class = $this_filter.attr('data-query-class');
					
				$data_send_to_server_1 = {
					'dataFilter':$this_data_filter, 
					'dataShortcode':$data_shortcode,
					'dataQueryClass':$this_data_query_class,
					'action':'cactusContentBlockJson',
				};
				
				var checkDropdown = $this_filter.parents('.view-sortby');
				
				if(checkDropdown.length > 0){
					var $currentItemText = checkDropdown.find('.cur-item').text();
					var $currentItemFilter = checkDropdown.find('.cur-item').attr('data-filter');
					
					checkDropdown.find('.cur-item').text($this_filter.text());
					checkDropdown.find('.cur-item').attr('data-filter', $this_filter.attr('data-filter'));
					
					$this_filter.text($currentItemText);
					$this_filter.attr('data-filter', $currentItemFilter);
					
					checkDropdown.removeClass('active');
				}else{
					$elm_filter.removeClass('active');
					$this_filter.addClass('active');
				}
				
				if(typeof(visFilter[$this_data_filter])=='object'){
					
					$this.addClass('loading-control');
					
					renew_data(
						visFilter[$this_data_filter].dataShortcode, 
						visFilter[$this_data_filter].dataTotalPages,
						visFilter[$this_data_filter].dataFilter, 
						visFilter[$this_data_filter].dataQuery,
						visFilter[$this_data_filter].dataQueryClass
					);					
					
					reset_data();					
					$data_paged = parseInt($('.ajax-container[data-filter="'+visFilter[$this_data_filter].dataFilter+'"].tab-active', $this).attr('data-paged'));
					
					ajax_posts('');
				}else{
					disableAllBtn();
					$.ajax({
						url:		ajax_url,
						type: 		'POST',
						data:		$data_send_to_server_1,
						dataType: 	'json',
						beforeSend: function(){		
							$this.addClass('loading-control');											
						},
						cache:		false,
						success: 	function(data){						
							if(typeof(data)=='object' && data!=null){
								
								visFilter[$this_data_filter] = {
									dataShortcode:'', 
									dataTotalPages:data.totalPages,
									dataFilter:$this_data_filter, 
									dataQuery:'',
									dataQueryClass:$this_data_query_class,
								};	
								
								renew_data(
									visFilter[$this_data_filter].dataShortcode, 
									visFilter[$this_data_filter].dataTotalPages,
									visFilter[$this_data_filter].dataFilter, 
									visFilter[$this_data_filter].dataQuery,
									visFilter[$this_data_filter].dataQueryClass
								); 								
								
								reset_data();
														
								ajax_posts('');														
							}else{
								$this.removeClass('loading-control');
							};
						},
						error:		function(jqXHR, textStatus, errorThrown){		
							/*console.log(jqXHR.responseText)*/					
						},
					});
				};
				return false;
			});
			
        });
	};
	/*smart content box*/
	if(typeof(video_iframe_params)=='undefined'){
		video_iframe_params=[];
	}
	if(typeof($.setIframeVideo)=='undefined'){
		$.setIframeVideo =  function(slider, timeOut, nextSlide, currentSlide){			
			var $videoinline = slider.find('.slick-slide[data-slick-index="'+nextSlide+'"]').find('.entry-content').attr('data-id');
			var $pictureContent = slider.find('.slick-slide[data-slick-index="'+nextSlide+'"]').find('.picture-content');
			
			if(typeof($videoinline)!='undefined' && $videoinline!='' && typeof(video_iframe_params[$videoinline])=='object' && $pictureContent.find('.player-inline').length==0){				
				$pictureContent.append(video_iframe_params[$videoinline][0]);
			};
			
			var $cur_videoinline = slider.find('.slick-slide[data-slick-index="'+currentSlide+'"]').find('.entry-content').attr('data-id');
			var $cur_pictureContent = slider.find('.slick-slide[data-slick-index="'+currentSlide+'"]').find('.picture-content');	
			
			setTimeout(function(){
				$cur_pictureContent.find('.player-inline').remove();
				if(typeof($cur_videoinline)!='undefined' && $cur_videoinline!='' && typeof(video_iframe_params[$cur_videoinline])=='object'){
					$cur_pictureContent.append(video_iframe_params[$cur_videoinline][0]);
				}
			},timeOut);
		};
	};
	
	if(typeof($.setFirstVideo)=='undefined'){		
		$.setFirstVideo = function(slider){
			var $videoinline = slider.find('.cactus-post-item:first-child').find('.entry-content').attr('data-id');
			var $pictureContent = slider.find('.cactus-post-item:first-child').find('.picture-content');					
							
			if(typeof($videoinline)!='undefined' && $videoinline!='' && typeof(video_iframe_params[$videoinline])=='object' && $pictureContent.find('.player-inline').length==0){
				$pictureContent.append(video_iframe_params[$videoinline][0]);
			};
		};
	};
		
	$d.ready(function(e) {
        $('.carousel-v1 .cactus-sub-wrap').each(function(index, element) {
			var $this = $(this);	
			var $autoPlay = $.trim($this.parents('.carousel-v1').attr('data-autoplay'));	
			$this.slick({
				arrows:						true,	
				dots: 						true,
				infinite: 					true,
				speed: 						500,
				slidesToShow: 				3,
				slidesToScroll:				3,
				adaptiveHeight: 			true,
				autoplay:					isNumber($autoPlay)?true:false,
				autoplaySpeed:				5000,
				accessibility:				false,
				pauseOnHover:				true,
				touchThreshold:				15,
				draggable:					true,
				responsive: [
					{
					  breakpoint: 			1920,
					  settings: {
						slidesToShow: 		3,
						slidesToScroll:		3,							
					  }
					},
					{
					  breakpoint: 			1601,
					  settings: {
						slidesToShow: 		3,
						slidesToScroll:		3,
					  }
					},
					{
					  breakpoint: 			1367,
					  settings: {
						slidesToShow: 		3,
						slidesToScroll:		3,
					  }
					},
					{
					  breakpoint: 			1025,
					  settings: {
						slidesToShow: 		3,
						slidesToScroll:		3,
					  }
					},
					{
					  breakpoint: 			769,
					  settings: {
						slidesToShow: 		2,
						slidesToScroll:		2,
					  }
					},
					{
					  breakpoint: 			600,
					  settings: {
						slidesToShow: 		1,
						slidesToScroll:		1,
					  }
					},
				]
			});			
			
			var $buttonPrev = $this.parents('.carousel-v1').find('.prev-slide');
			var $buttonNext = $this.parents('.carousel-v1').find('.next-slide');
			
			$buttonPrev.on('click', function(){
				$this.slick('slickPrev');
			});
			$buttonNext.on('click', function(){
				$this.slick('slickNext');
			});
			
			$w.resize(function(){
				setTimeout(function(){
					if($this.find('.slick-dots').length==0) {
						$buttonPrev.hide();
						$buttonNext.hide();
					}else{
						$buttonPrev.show();
						$buttonNext.show();
					}
				},200);
			});
			
			if($this.find('.slick-dots').length==0) {
				$buttonPrev.hide();
				$buttonNext.hide();
			}
		});
		
		var sync_slider_top = [], sync_slider_btt = [];
		
		$('.control-slider-sync').each(function(index, element) {
            var $this = $(this);
			
			var $autoPlay = $.trim($this.attr('data-autoplay'));
			var $fade = $.trim($this.attr('data-fade'));
			
			var $top_slider = $this.find('.carousel-v2-sub .cactus-sub-wrap');
			
			$.setFirstVideo($top_slider);
			
			sync_slider_top[index] = $top_slider.slick({
				arrows:						true,	
				dots: 						true,
				infinite: 					true,
				speed: 						400,
				slidesToShow: 				1,
				slidesToScroll:				1,
				adaptiveHeight: 			true,
				autoplay:					isNumber($autoPlay)?true:false,
				autoplaySpeed:				5000,
				accessibility:				false,
				pauseOnHover:				true,
				touchThreshold:				15,
				draggable:					true,
				fade: 						$fade=='1'?true:false,				
			});	
			
			var $btt_slider = $this.find('.carousel-v2 .cactus-sub-wrap');
			sync_slider_btt[index] = $btt_slider.slick({
				arrows:						true,	
				dots: 						true,
				infinite: 					true,
				speed: 						500,
				slidesToShow: 				4,
				slidesToScroll:				4,
				adaptiveHeight: 			true,
				autoplay:					false,
				accessibility:				false,
				pauseOnHover:				true,
				touchThreshold:				15,
				draggable:					true,
				responsive: [
					{
					  breakpoint: 			1920,
					  settings: {
						slidesToShow: 		4,
						slidesToScroll:		4,							
					  }
					},
					{
					  breakpoint: 			1601,
					  settings: {
						slidesToShow: 		4,
						slidesToScroll:		4,
					  }
					},
					{
					  breakpoint: 			1367,
					  settings: {
						slidesToShow: 		4,
						slidesToScroll:		4,
					  }
					},
					{
					  breakpoint: 			1025,
					  settings: {
						slidesToShow: 		3,
						slidesToScroll:		3,
					  }
					},
					{
					  breakpoint: 			769,
					  settings: {
						slidesToShow: 		2,
						slidesToScroll:		2,
					  }
					},
					{
					  breakpoint: 			600,
					  settings: {
						slidesToShow: 		1,
						slidesToScroll:		1,
					  }
					},
				]
			});	
			
			var $buttonPrev = $btt_slider.parents('.cactus-listing-config').find('.prev-slide');
			var $buttonNext = $btt_slider.parents('.cactus-listing-config').find('.next-slide');
			
			$buttonPrev.on('click', function(){
				sync_slider_btt[index].slick('slickPrev');
			});
			$buttonNext.on('click', function(){
				sync_slider_btt[index].slick('slickNext');
			});
			
			sync_slider_top[index].on('beforeChange', function(event, slick, currentSlide, nextSlide){
				sync_slider_btt[index].slick('slickGoTo', nextSlide);
				$btt_slider.find('.slick-slide').removeClass('active');
				$btt_slider.find('.slick-slide[data-slick-index="'+nextSlide+'"]').addClass('active');
				
				$.setIframeVideo($top_slider, 400, nextSlide, currentSlide);
			});			
						
			$w.resize(function(){
				setTimeout(function(){
					if($btt_slider.find('.slick-dots').length==0) {					
						$buttonPrev.hide();
						$buttonNext.hide();
						$('.slider-title', $this).addClass('hidden-button');
					}else{					
						$buttonPrev.show();
						$buttonNext.show();
						$('.slider-title', $this).removeClass('hidden-button');
					};
				},200);
			});
			
			$btt_slider.find('.slick-slide *, .slick-slide').off('.nextSlider').on('click.nextSlider', function(){
				sync_slider_top[index].slick('slickGoTo', $(this).parents('.cactus-post-item').attr('data-slick-index'));
				//$btt_slider.find('.slick-slide').removeClass('active');
				//$(this).parents('.cactus-post-item').addClass('active');				
				return false;
			});
			
			if($btt_slider.find('.slick-dots').length==0) {
				$buttonPrev.hide();
				$buttonNext.hide();
				$('.slider-title', $this).addClass('hidden-button');
			};				
        });
		
		$('.cactus-single-slider .cactus-sub-wrap').each(function(index, element) {
            var $this = $(this);						
			
			$.setFirstVideo($this);	
								
			var $autoPlay = $.trim($this.parents('.cactus-single-slider').attr('data-autoplay'));
			$this.slick({
				arrows:						true,	
			  	dots: 						true,
			  	infinite: 					true,
			  	speed: 						500,
			  	slidesToShow: 				1,
			  	slidesToScroll:				1,
			  	adaptiveHeight: 			true,
				autoplay:					isNumber($autoPlay)?true:false,
				autoplaySpeed:				5000,
				accessibility:				false,
				pauseOnHover:				true,
				touchThreshold:				15,
				draggable:					true,			  	
			});
			
			var $buttonPrev = $this.parents('.cactus-single-slider').find('.prev-slide');
			var $buttonNext = $this.parents('.cactus-single-slider').find('.next-slide');
			
			$buttonPrev.on('click', function(){
				$this.slick('slickPrev');
			});
			$buttonNext.on('click', function(){
				$this.slick('slickNext');
			});
			
			$this.on('beforeChange', function(event, slick, currentSlide, nextSlide){				
				$.setIframeVideo($this, 500, nextSlide, currentSlide);
			});
			
			$w.resize(function(){
				setTimeout(function(){
					if($this.find('.slick-dots').length==0) {
						$buttonPrev.hide();
						$buttonNext.hide();
					}else{
						$buttonPrev.show();
						$buttonNext.show();
					}
				},200);
			});
			
			if($this.find('.slick-dots').length==0) {
				$buttonPrev.hide();
				$buttonNext.hide();
			}
        });	
		
		$('.ct-shortcode-sliderv6').each(function(index, element) {
            var $this = $(this);
			var $autoPlay = $.trim($this.attr('data-autoplay'));
			$this.slick({
				arrows:						true,	
			  	dots: 						true,
			  	infinite: 					true,
			  	speed: 						400,
			  	slidesToShow: 				1,
				autoplay:					isNumber($autoPlay)?true:false,
				autoplaySpeed:				5000,
				pauseOnHover:				true,
				touchThreshold:				15,
				draggable:					true,
				variableWidth: 				true,
				clones:						5,
				initialSlide:				4,
			});
			
			var $buttonPrev = $this.parents('.sliderv6_wrapper').find('.prev-slide');
			var $buttonNext = $this.parents('.sliderv6_wrapper').find('.next-slide');
			
			$buttonPrev.on('click', function(){
				$this.slick('slickPrev');
			});
			$buttonNext.on('click', function(){
				$this.slick('slickNext');
			});
        });
		
		$('.open-share-toolbar-shortcode').on('click', function(){
			var $__parent = $(this).parents('.cactus-post-item');
			
			if($('#submitShareSC').length==0){
				$('body').append(
					'<div class="submitModal modal fade" id="submitShareSC">'+
					  '<div class="modal-dialog">'+
						'<div class="modal-content">'+
						  '<div class="modal-header">'+
							'<button type="button" class="close" data-dismiss="modal" aria-hidden="true"><i class="fa fa-times"></i></button>'+
							'<h4 class="modal-title" id="myModalLabel">'+$__parent.find('.social-share-html').attr('data-lang')+'</h4>'+
						  '</div>'+
						  '<div class="modal-body">'+        
						  '</div>'+
						'</div>'+
					  '</div>'+
					'</div>'					
				);
				
				$('#submitShareSC .close, #submitShareSC').on('click', function(){
					$('#submitShareSC').toggleClass('active');
					return false;
				});
			
				$('.modal .modal-content').on('click', function(event){
					event.stopPropagation();
				});			
			};
			
			$('#submitShareSC .modal-body').html($__parent.find('.social-share-html').html());
			
			$('#submitShareSC').toggleClass('active');
						
			return false;
		});	
		
        $.ct_contentbox({
			elms:$('.cactus-contents-block'),
		});

    });
	
}(jQuery, jQuery(window), jQuery(document), window, document));