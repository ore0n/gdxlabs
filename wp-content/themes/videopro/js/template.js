;(function($){
	function msieversion() {		
		var ua = window.navigator.userAgent;
		var msie = ua.indexOf("MSIE ");	
		if (msie > 0 || !!navigator.userAgent.match(/Trident.*rv\:11\./)) {   // If Internet Explorer, return version number
			//alert(parseInt(ua.substring(msie + 5, ua.indexOf(".", msie))));
			return true;
		}else{                 // If another browser, return 0
			return false;
		};
	};
	function setHeightWide(){ //Test
		if($('#before-sidebar').length>0){
			$('#before-sidebar').html('.cactus-sidebar:before,.cactus-sidebar:after{bottom:auto; height:'+$('#cactus-body-container').height()+'px;}');
		}else{
			$('<style id="before-sidebar">.cactus-sidebar:before,.cactus-sidebar:after{bottom:auto; height:'+$('#cactus-body-container').height()+'px;}</style>').appendTo('head');
		}
	}
	if(typeof(video_iframe_params)=='undefined'){
		video_iframe_params=[];
	}
	if(typeof($.setIframeVideo)=='undefined'){
		$.setIframeVideo =  function(slider, timeOut, nextSlide, currentSlide){			
			var $videoinline = slider.find('.slick-slide[data-slick-index="'+nextSlide+'"]').find('.entry-content').attr('data-id');
			var $pictureContent = slider.find('.slick-slide[data-slick-index="'+nextSlide+'"]').find('.picture-content');
			
			if(typeof($videoinline)!='undefined' && $videoinline!='' && typeof(video_iframe_params[$videoinline])=='object' && $pictureContent.find('.player-inline').length==0){				
				$pictureContent.append(video_iframe_params[$videoinline][0]);
				if(typeof window.wp.mediaelement !== 'undefined'){
					$( window.wp.mediaelement.initialize );
				}
			};
			
			var $cur_videoinline = slider.find('.slick-slide[data-slick-index="'+currentSlide+'"]').find('.entry-content').attr('data-id');
			var $cur_pictureContent = slider.find('.slick-slide[data-slick-index="'+currentSlide+'"]').find('.picture-content');	
			
			setTimeout(function(){
				$cur_pictureContent.find('.player-inline').remove();
				if(typeof($cur_videoinline)!='undefined' && $cur_videoinline!='' && typeof(video_iframe_params[$cur_videoinline])=='object'){
					$cur_pictureContent.append(video_iframe_params[$cur_videoinline][0]);
					if(typeof window.wp.mediaelement !== 'undefined'){
						$( window.wp.mediaelement.initialize );
					}
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
				if(typeof window.wp.mediaelement !== 'undefined'){
					$( window.wp.mediaelement.initialize );
				}
			};
		};
	}
	
	$(document).ready(function(){
        /**
         * load custom background
         */
        if($('#body-wrap').attr('data-background') != ''){
            $('#body-wrap').css('background', $('#body-wrap').attr('data-background'));
            $('#wrap').css('background-color', '#FFF');
        }
					
		// ajax add user subscribe
		$('.subscribe-user a.logged').on('click',function() {
			var $this_click = $('.subscribe-user');
			$this_click.addClass('disable-click');
			var id_user  		= $this_click.data('id');
			var id_fav  		= $this_click.attr('id');
			var number_fav  		= $('#'+id_fav +' .sub-count').html()*1;
			$this_click.addClass("loading");
			var ajax_url  		= $('.subscribe-user input[name=ajax_url]').val();
				var param = {
					action: 'cactus_subscribe_user',
					id_user: id_user ,
				};
				$.ajax({
					type: "post",
					url: ajax_url,
					dataType: 'html',
					data: (param),
					success: function(data){
						if(data == 0){
							$($this_click).removeClass("loading");
							$this_click.removeClass('disable-click');
							if($this_click.hasClass('added')){
								$('#'+id_fav +' .sub-count').html(number_fav-1);
								$($this_click).removeClass("added");
							}else{
								$($this_click).addClass("added");
								$('#'+id_fav +' .sub-count').html(number_fav + 1);
							}
						}else{
							$($this_click).removeClass("loading");
							$this_click.removeClass('disable-click');
						}
					}
				});
			return false;	
		});
	

		var $window = $(window);
		
		$('[data-toggle="tooltip"]').tooltip();
		
		$('.cactus-main-menu:not(.cactus-user-login)>ul>li>*:not(a)').each(function(index, element) {
            if($(this).length>0){
				$(this).parents('li').children('a').addClass('cactus-hasIcon').append('<i class="fas fa-sort-down"></i>');
			};
        }); //Menu lv1
		
		$('.cactus-main-menu:not(.cactus-user-login)>ul>li>*:not(a) li>*:not(a)').each(function(index, element) {
            if($(this).length>0){
				$(this).parent().children('a').addClass('cactus-hasIcon').append('<i class="fas fa-sort-down"></i>');
			};
        }); //Menu lv2, 3, 4 ...
		
		$('.cactus-open-search-mobile a').on('click.openSearchMobile', function(){
			var $this = $(this);
			var $searhFormAction = $('.cactus-header-search-form form', $this.parents('.cactus-nav-control'));			
			if($searhFormAction.hasClass('active')) {
				$('i.fa', $this).removeClass('fa-times').addClass('fa-search');
				$searhFormAction.removeClass('active');
			}else{
				$('i.fa', $this).removeClass('fa-search').addClass('fa-times');
				$searhFormAction.addClass('active');
				setTimeout(function(){
					$('input[type="text"]', $searhFormAction).focus();
				},300);				
			};
			return false;
		});
		
		/*Mobile*/
		$('#off-canvas .off-menu>ul>li>*:not(a)').each(function(index, element) {
            if($(this).length>0){
				$(this).parent('li').addClass('set-parent').children('a').append('<span class="set-children"><i class="fas fa-sort-down"></i></span>');
			};
        }); //Menu lv1
		
		$('#off-canvas .off-menu>ul>li>*:not(a) li>*:not(a)').each(function(index, element) {
			if($(this).length>0){
				$(this).parent('li').addClass('set-parent').children('a').append('<span class="set-children"><i class="fas fa-sort-down"></i></span>');
			};
		}); //Menu lv2, 3, 4 ...
		
		$('#off-canvas .off-menu .set-children').on('click', function(){
			var $this = $(this);
			var $currentSubMenu = $this.parent('a').next();
			
			if($currentSubMenu.hasClass('active')){
			} else {
				// close other active
				$('> li > .dropdown-menu',$this.parent().parent().parent()).removeClass('active');
			}
			
			$currentSubMenu.toggleClass('active');
			$this.toggleClass('rotate-90deg');
			return false;			
		});
		/*Mobile*/
		
		/*widget custom menu*/
		$('.widget_nav_menu .menu>li.menu-item-has-children > a').on('click', function() {
			var $this = $(this).parent('li');
			$this.toggleClass('active').children('ul').slideToggle('active');
			return false;
		}); 
		/*widget custom menu*/
		
		/*sidebar-small*/
		if(!$('.cactus-sidebar-control').hasClass('sb-ct-small')){
			$('.cactus-open-left-sidebar').remove();
		}else{
			$('.cactus-open-left-sidebar a, .open-sidebar-small').on('click', function(){
				var $this = $(this);
				$('body').toggleClass('open-mobile-sidebar-ct');
				
				var $smallSiderbar = $('.cactus-sidebar.ct-small');
				if($('body').hasClass('open-mobile-sidebar-ct') && $smallSiderbar.length>0) {
					if($('.cactus-sidebar-content', $smallSiderbar).hasClass('mCustomScrollbar')) { return false;};
					$('.cactus-sidebar-content', $smallSiderbar).addClass('position-absolute').mCustomScrollbar({theme:'minimal-dark',});
				};
				return false;
			});	
		};
		/*sidebar-small*/
		
		var $menuMobileTouch = $('.cactus-main-menu>ul li>a');
		$menuMobileTouch.on('touchstart', function(e){
			var $this = $(this);
			if($this.parent('li').find('ul').length > 0 && !$this.hasClass('no-go-to-touch')){
				$menuMobileTouch.removeClass('no-go-to-touch');
				$this.addClass('no-go-to-touch');
				return false;
			};
		});	
		
		var $switch_mode = $('.view-mode-switch > div');
		var $listing_change = $('.cactus-listing-wrap.switch-view-enable > .cactus-listing-config');
		$switch_mode.on('click', function(){
			var $this = $(this);			
			if($this.hasClass('active')) {return false;};
			var __style_name = $this.attr('data-style');
			$switch_mode.removeClass('active');
			$this.addClass('active');
			
			switch(__style_name) {
				case 'style-2':
					$listing_change.removeClass('style-2 style-3').addClass('style-2');
					break;
				case 'style-3':
					$listing_change.removeClass('style-2 style-3').addClass('style-3');
					break;
				default:
					$listing_change.removeClass('style-2 style-3');				
			};
			//$(window).scrollTop($this.offset().top-60);
			return false;
		});
		
		$('.view-sortby').on('click', function(){
			var $this = $(this);
			if($this.hasClass('active')) {
				$this.removeClass('active');
			}else{
				$this.addClass('active');
			};
		});
		
		
		$('.cactus-carousel-style-bottom .cactus-sub-wrap').each(function(index, element) {
            var $this = $(this);
			var $boxItems = false;
			var $singleItem = false;
			
			if($this.parents('#body-wrap').hasClass('cactus-box')){
				$boxItems=true;
			};
			
			if($this.parents('.cactus-carousel-style-bottom').hasClass('default-sidebar')){
				$singleItem=true;
			};
			
			$this.slick({
				arrows:						true,	
			  	dots: 						true,
			  	infinite: 					true,
			  	speed: 						500,
			  	slidesToShow: 				$singleItem?1:($boxItems?5:7),
			  	slidesToScroll:				1,
			  	adaptiveHeight: 			true,
				autoplay:					false, //true
				//autoplaySpeed:				5000,
				accessibility:				false,
				pauseOnHover:				true,
				touchThreshold:				15,
				draggable:					true,
			  	responsive: [
					{
					  breakpoint: 			1920,
					  settings: {
						slidesToShow: 		$singleItem?1:($boxItems?5:7),							
					  }
					},
					{
					  breakpoint: 			1599,
					  settings: {
						slidesToShow: 		$singleItem?1:($boxItems?5:6),
					  }
					},
					{
					  breakpoint: 			1280,
					  settings: {
						slidesToShow: 		$singleItem?1:4,
					  }
					},
					{
					  breakpoint: 			991,
					  settings: {
						slidesToShow: 		$singleItem?1:3,
					  }
					},
					{
					  breakpoint: 			600,
					  settings: {
						slidesToShow: 		$singleItem?1:2,
					  }
					},
					{
					  breakpoint: 			480,
					  settings: {
						slidesToShow: 		1,
					  }
					},
				]
			});
			
			$buttonPrev = $this.parents('.cactus-carousel-style-bottom').find('.prev-slide');
			$buttonNext = $this.parents('.cactus-carousel-style-bottom').find('.next-slide');
			
			$buttonPrev.on('click', function(){
				$this.slick('slickPrev');
			});
			$buttonNext.on('click', function(){
				$this.slick('slickNext');
			});
			
			$this.on('afterChange', function(event, slick, currentSlide, nextSlide){
				if($this.find('.slick-dots').length==0) {
					$buttonPrev.hide();
					$buttonNext.hide();
				}else{
					$buttonPrev.show();
					$buttonNext.show();
				}
			});
			
			if($this.find('.slick-dots').length==0) {
				$buttonPrev.hide();
				$buttonNext.hide();
			}
        });
		
		$('.style-gallery-content .gallery-slider').each(function(index, element) {
            var $this = $(this);						
			$this.slick({
				arrows:						true,	
			  	dots: 						true,
			  	infinite: 					true,
			  	speed: 						500,
			  	slidesToShow: 				1,
			  	slidesToScroll:				1,
			  	adaptiveHeight: 			true,
				autoplay:					true,
				autoplaySpeed:				5000,
				accessibility:				false,
				pauseOnHover:				true,
				touchThreshold:				15,
				draggable:					true,			  	
			});
			
			$buttonPrev = $this.parents('.style-gallery-content').find('.prev-slide');
			$buttonNext = $this.parents('.style-gallery-content').find('.next-slide');
			
			$buttonPrev.on('click', function(){
				$this.slick('slickPrev');
			});
			$buttonNext.on('click', function(){
				$this.slick('slickNext');
			});
			
			$this.on('afterChange', function(event, slick, currentSlide, nextSlide){
				if($this.find('.slick-dots').length==0) {
					$buttonPrev.hide();
					$buttonNext.hide();
				}else{
					$buttonPrev.show();
					$buttonNext.show();
				}
			});
			
			if($this.find('.slick-dots').length==0) {
				$buttonPrev.hide();
				$buttonNext.hide();
			}
        });
		
		$('.slider-toolbar-carousel .cactus-sub-wrap').each(function(index, element) {
            var $this = $(this);
			
			var $boxItems = false;
			if($this.parents('#body-wrap').hasClass('cactus-box')) {
				$boxItems = true;
			};
			if($this.parents('.ct-default').length>0) {
				$boxItems = true;
			};
			
			var $fullWidth = false;
			if($this.parents('.videov2-style').length>0){
				$fullWidth = true;
			}
            
            var slidesToShow = $fullWidth ? 6 : ($boxItems ? 3 : 4);
            
            var infinite = true;
			
			$this.slick({
				arrows:						true,	
			  	dots: 						true,
			  	infinite: 					infinite,
			  	speed: 						500,
			  	slidesToShow: 				slidesToShow,
			  	slidesToScroll:				1,
			  	adaptiveHeight: 			true,
				autoplay:					false,
				autoplaySpeed:				5000,
				accessibility:				false,
				pauseOnHover:				true,
				touchThreshold:				15,
				draggable:					true,
			  	responsive: [
					{
					  breakpoint: 			1920,
					  settings: {
						slidesToShow: 		slidesToShow,							
					  }
					},
					{
					  breakpoint: 			1601,
					  settings: {
						slidesToShow: 		$fullWidth?(4):(3),
					  }
					},
					{
					  breakpoint: 			1367,
					  settings: {
						slidesToShow: 		$fullWidth?(4):(2),
					  }
					},
					{
					  breakpoint: 			1025,
					  settings: {
						slidesToShow: 		3,
					  }
					},
					{
					  breakpoint: 			769,
					  settings: {
						slidesToShow: 		2,
					  }
					},
					{
					  breakpoint: 			600,
					  settings: {
						slidesToShow: 		1,
					  }
					},
				]
			});		

            // find current active slide
            var active_index = $this.find('.active:not(.slick-cloned)').attr('data-slick-index');            
            var slick_go_to = active_index - Math.ceil(slidesToShow / 2) + 1;
            var number_of_slides = $this.find('.cactus-post-item:not(.slick-cloned)').length;
            
            if(!infinite){
                if(slick_go_to + slidesToShow - 1 > number_of_slides) slick_go_to = number_of_slides - slidesToShow;
                if(slick_go_to < 0) slick_go_to = 0;
            } else {
                
            }

            $this.slick('slickGoTo', slick_go_to);
			
			$buttonPrev = $this.parents('.slider-toolbar').find('.prev-slide');
			$buttonNext = $this.parents('.slider-toolbar').find('.next-slide');
			
			$buttonPrev.on('click', function(){
				$this.slick('slickPrev');
			});
			$buttonNext.on('click', function(){
				$this.slick('slickNext');
			});
			
			$this.on('afterChange', function(event, slick, currentSlide, nextSlide){
				if($this.find('.slick-dots').length==0) {
					$buttonPrev.hide();
					$buttonNext.hide();
				}else{
					$buttonPrev.show();
					$buttonNext.show();
				}
			});
			
			if($this.find('.slick-dots').length==0) {
				$buttonPrev.hide();
				$buttonNext.hide();
			}
        });
		
		var openShareFunc = function(){	
			var $this = $(this);
			var $__parents = $this.parents('.video-toolbar');
			var $__elems_active = $('.social-share-tool-bar-group', $__parents);
			
			if($__parents.length==0){return false;}	
					
			if($('.slider-toolbar-group', $__parents).hasClass('active')) {
				$('.open-carousel-post-list').trigger('click');
			};
						
			if($__elems_active.hasClass('active')){
				$__elems_active.animate({height:0,},300);
			}else{
				$__elems_active.animate({height:$__elems_active.find('.group-social-content').outerHeight(),},300);
			};	
			$__elems_active.toggleClass('active');
			$this.toggleClass('active');		
			
			return false;		
		};
			
		$('.open-share-toolbar').on('click', openShareFunc);
		
		function resizeShare(){
			var $__parents = $('.open-share-toolbar').parents('.video-toolbar');
			var $__elems_active = $('.social-share-tool-bar-group', $__parents);			
			if($__elems_active.hasClass('active')){
				$__elems_active.height($__elems_active.find('.group-social-content').outerHeight());
			};	
		};
		
		var openCarouselFunc = function(){
			if($('.social-share-tool-bar-group', $__parents).hasClass('active')) {
				$('.open-share-toolbar').trigger('click');
			};
			
			var $this = $(this);
			var $__parents = $this.parents('.video-toolbar');
			var $__elems_active = $('.slider-toolbar-group', $__parents);			
			if($__elems_active.hasClass('active')){
				$__elems_active.animate({height:0,},300);
			}else{
				$__elems_active.animate({height:$__elems_active.find('.slider-toolbar').outerHeight(),},300);
			};	
			$__elems_active.toggleClass('active');
			$this.toggleClass('active');
			
			return false;		
		};
		$('.open-carousel-post-list').on('click', openCarouselFunc);	
		
		function resizeCarousel(){
			var $__parents = $('.open-carousel-post-list').parents('.video-toolbar');
			var $__elems_active = $('.slider-toolbar-group', $__parents);
			if($__elems_active.hasClass('active')){				
				$__elems_active.height($__elems_active.find('.slider-toolbar').outerHeight());
			};		
		};
		
		$('.remove-hidden-content').on('click', function(){
			$('.body-content').removeClass('hidden-content');
			return false;
		});
		
		function autoScrollToActiveVideo(playlist_videoListing, playlist_videoItem){
			var $playlist_videoListing = playlist_videoListing;
			var $playlist_videoItem = playlist_videoItem;
			for(var iz=0; iz<=$playlist_videoItem.length; iz++) {			
				if($playlist_videoItem.eq(iz).hasClass('active')){
					if(iz > 0) {
						$playlist_videoListing.mCustomScrollbar("scrollTo", ($playlist_videoItem.eq(iz).position().top-15)+'px');
					};
					break;
				};
			};
		}
		
		function msIESetHeightPlaylist(playlist_videoListing, playlist_videoItem, playlist_video_iframe, playlist_scroll_bar){
			if(msieversion()){
				if(window.innerWidth < 1024) {
					playlist_scroll_bar.removeAttr('style');
					return false;
				}
				playlist_scroll_bar.height(playlist_video_iframe.height());
				playlist_videoListing.mCustomScrollbar({
					theme:"dark",
					autoHideScrollbar:true,
					callbacks:{
						onInit: function(){autoScrollToActiveVideo(playlist_videoListing, playlist_videoItem)},
					}
				});	
			};
		};
		
		$('.cactus-post-format-playlist').each(function(index, element){
			var $this = $(this);
			
			var $playlist_videoListing = $('.video-listing', $this);
			var $playlist_videoItem	= $('.cactus-post-item', $this);
			var $playlist_video_iframe = $('.video-iframe-content', $this);
			var $playlist_scroll_bar = $('.playlist-scroll-bar', $this);
			
			$playlist_videoListing.mCustomScrollbar({
				theme:"dark",
				autoHideScrollbar:true,
				callbacks:{
					onInit: function(){autoScrollToActiveVideo($playlist_videoListing, $playlist_videoItem)},
				}
			});	
			
			msIESetHeightPlaylist($playlist_videoListing, $playlist_videoItem, $playlist_video_iframe, $playlist_scroll_bar);
			
			$('.action-top', $this).on('click', function(){						
				$playlist_videoListing.mCustomScrollbar('scrollTo','+=120');
			});
			
			$('.action-bottom', $this).on('click', function(){						
				$playlist_videoListing.mCustomScrollbar('scrollTo','-=120');
	
			});
			
			var $__parent = $this.parents('.shortcode-sliderV9');
			if($__parent.length>0){
			
				var $autoPlay = $.trim($__parent.attr('data-autoplay'));
				
				var $top_slider = $__parent.find('.carousel-v2-sub .cactus-sub-wrap');
				
				if(typeof($.setFirstVideo)!='undefined'){
					$.setFirstVideo($top_slider);
				}
				
				$top_slider.slick({
					arrows:						true,	
					dots: 						true,
					infinite: 					true,
					speed: 						400,
					slidesToShow: 				1,
					slidesToScroll:				1,
					adaptiveHeight: 			true,
					autoplay:					($autoPlay != '' || $autoPlay == '0') ? true : false,
					autoplaySpeed:				5000,
					accessibility:				false,
					pauseOnHover:				true,
					touchThreshold:				15,
					draggable:					true,
					fade: 						true,	
				});
				
				var $sliderItem = $('.video-playlist-content .cactus-post-item', $__parent);
				
				$top_slider.on('beforeChange', function(event, slick, currentSlide, nextSlide){				
					$sliderItem.removeClass('active');
					$sliderItem.eq(nextSlide).addClass('active');
					autoScrollToActiveVideo($playlist_videoListing, $playlist_videoItem);
					
					if(typeof($.setIframeVideo) != 'undefined'){
						$.setIframeVideo($top_slider, 400, nextSlide, currentSlide);
					}
				});
				
				$sliderItem.on('click', function(){
					$top_slider.slick('slickGoTo', $(this).index());
					return false;
				});
			}
            
        });
		
		/*sticky menu*/
			/*clone Elms*/				
			if($('body').hasClass('enable-sticky-menu')) {
				$('#header-navigation').addClass('primary-header').clone(true).addClass('sticky-menu').removeClass('primary-header').insertAfter('#header-navigation');
				
				var $newMenu = $('.sticky-menu');				
				$('.cactus-container', $newMenu).removeClass('medium');
				
				var $ElmsNAV = $('.cactus-nav-control:first-child', $newMenu);
				$('.cactus-container > .cactus-row', $ElmsNAV).addClass('reset-default-nav');
				
				var $nextElmsNAV = $ElmsNAV.next('.cactus-nav-control');
				if($nextElmsNAV.length>0){
					$('.cactus-only-main-menu', $nextElmsNAV).clone(true).appendTo('.reset-default-nav');					
					$nextElmsNAV.remove();
				};
				
				$ElmsNAV.removeClass('cactus-nav-style-3 cactus-nav-style-4 cactus-nav-style-5 cactus-nav-style-7');
				$('.cactus-nav-main', $ElmsNAV).addClass('dark-bg-color-1');
				
				$('.sub-menu-box .channel-title', $newMenu).each(function(index, element) {
                    var oldTarget = $(this).attr('data-target');
					$(this).attr('data-target', oldTarget+'clone');
                });
				$('.sub-menu-box .channel-content', $newMenu).each(function(index, element) {
                    var oldTarget = $(this).attr('id');
					$(this).attr('id', oldTarget+'clone');
                });
				
                if($('.sticky-menu .cactus-header-search-form').length > 0){
                    $('<div class="cactus-main-menu cactus-open-menu-mobile navigation-font"><ul><li><a href="javascript:;"><i class="fas fa-bars"></i></a></li></ul></div>')
                            .insertAfter('.sticky-menu .cactus-header-search-form');
                } else {
                    $('<div class="cactus-main-menu cactus-open-menu-mobile navigation-font"><ul><li><a href="javascript:;"><i class="fas fa-bars"></i></a></li></ul></div>')
                            .insertAfter('.sticky-menu .cactus-main-menu');
                }
				
				
				$.cactus_megamenu();
			};
			
			var $primaryHD = $('.primary-header');
			var $checkEnableSticky = 0;
			
			if($('body').hasClass('enable-sticky-menu')) {
				$checkEnableSticky = 1;
			}
			/*clone Elms*/
			
			/*floating widget*/
			function floating_widget(elms, scrollFNC){				
				elms.forEach(function(currentValue, index, arr){
					var $this = $(currentValue+' .widget.floating:last-child');
					if($this.length==0){
						return;
					};
								
					var $this_float = $('.widget-inner', $this);						
					var $__parent = $this.parents(currentValue),
						$__container_offset = $('#cactus-body-container');									
					if($__parent.length==0){
						return;
					};
					
					var $__parent_padding = $('.cactus-sidebar-content', $__parent),					
						$__offset_left = $__parent_padding.offset().left;
						
					$this.css({'height':($this_float.outerHeight())+'px'});
					var topOffset = $('#wpadminbar').height()+$('.sticky-menu.active').height()+20;				
					var	bottomOffset = $__container_offset.offset().top+$__container_offset.height()-$this_float.outerHeight()-parseInt($(currentValue).css('padding-bottom'))-topOffset;
					var absoluteOffset = $__container_offset.height()-$this_float.outerHeight()-parseInt($(currentValue).css('padding-bottom'))-parseInt($(currentValue).css('padding-top'));
					
					if($__container_offset.offset().top!=$(currentValue).offset().top){						
						absoluteOffset = $__container_offset.offset().top+$__container_offset.height()-$(currentValue).offset().top-$this_float.outerHeight()-parseInt($(currentValue).css('padding-bottom'))-parseInt($(currentValue).css('padding-top'));
					};
																	
					if(($window.scrollTop()+topOffset)>=$this.offset().top && $window.scrollTop()<=bottomOffset && window.innerWidth>1024){
						if(window.innerWidth<1281 && currentValue=='.ct-small'){
							$this.removeAttr('style');
							$this_float.removeAttr('style');
							$__parent_padding.removeClass('is-fixed');
							return;
						}
						//topOffset = $('#wpadminbar').height()+$('.sticky-menu.active').height()+20;
						if(!$__parent_padding.hasClass('is-fixed') || $__offset_left!=$this_float.offset().left || topOffset!=parseInt($this_float.css('top'))){
							$this_float.css({'position':'fixed', 'left':$__offset_left+'px', 'top':(topOffset)+'px', 'width':$__parent_padding.width()+'px', 'z-index':'2'});
							$__parent_padding.addClass('is-fixed');
						};
					}else{	
						
						if($__parent_padding.hasClass('is-fixed')){
							$this_float.css({'position':'absolute', 'left':'0', 'top':(absoluteOffset)+'px', 'width':$__parent_padding.width()+'px',});
							$__parent_padding.removeClass('is-fixed');
						};
						
						if(window.innerWidth<1025 || $window.scrollTop()<=$this.offset().top){
							$this.removeAttr('style');
							$this_float.removeAttr('style');
							$__parent_padding.removeClass('is-fixed');
						}
					};	
				});					
			};		
			/*floating widget*/
			
			/*scroll Up & down*/
			function scrollFunc(e) {
				
				if($checkEnableSticky == 0 && $('.widget.floating').length == 0){return;}
				floating_widget(['.ct-medium', '.ct-small'], 'down');
												
				if ( typeof scrollFunc.x == 'undefined' ) {
					scrollFunc.x = window.pageXOffset;
					scrollFunc.y = window.pageYOffset;
				};
				
				var diffX=scrollFunc.x-window.pageXOffset;
				var diffY=scrollFunc.y-window.pageYOffset;
			
				if(diffX<0) {
					// Scroll right
				}else if( diffX>0 ) {
					// Scroll left
				}else if( diffY<0 ) {					
					// Scroll down
					if($('body').hasClass('behavior-up')){						
						$newMenu.removeClass('active');						
					}										
				}else if( diffY>0 ) {					
					// Scroll up					
					if($('body').hasClass('behavior-up')){
						if($window.scrollTop()>($primaryHD.offset().top+$primaryHD.height())){	
							if(!$newMenu.hasClass('active')){						
								$newMenu.addClass('active');	
							};
						}else{							
							$newMenu.removeClass('active');
						};
					};
					//floating_widget(['.ct-medium', '.ct-small'], 'up');
				}else {
					// First scroll event
				}
				scrollFunc.x = window.pageXOffset;
				scrollFunc.y = window.pageYOffset;
				
				/*behavior down*/
				if($('body').hasClass('behavior-down')){
                    if ($primaryHD.length) {
                        if($window.scrollTop()>($primaryHD.offset().top+$primaryHD.height())){
                            if(!$newMenu.hasClass('active')){
                                $newMenu.addClass('active');
                            };
                        }else{
                            $newMenu.removeClass('active');
                        };
                    }
				};
				/*behavior down*/
			};
			/*scroll Up & down*/
		/*sticky menu*/
		
		$('.cactus-open-menu-mobile a').on('click', function(){
			$('body').toggleClass('open-mobile-menu-ct');
			return false;
		});	
		
		$('.close-canvas-menu, .canvas-ovelay').on('click', function(){
			$('body').toggleClass('open-mobile-menu-ct');
			return false;
		});	
		
		$('.autoplay-group').on('click', function(){
			var $this = $(this);
			$('.autoplay-elms', $this).toggleClass('active');
			if($('.autoplay-elms', $this).hasClass('active')){
				Cookies.set('actionautonextvideo', 'on');
			}else{
				Cookies.set('actionautonextvideo', 'off');
			};
		});
		
		$('#open-report, #submitReport .close, #submitReport').on('click', function(){
			$('#submitReport').toggleClass('active');
			return false;
		});		
		$('.modal .modal-content').on('click', function(event){
			event.stopPropagation();
		});
		
		/*tooltips*/
			$('.picture.has-tooltip')
			.on('mouseenter', function(){
				$(this).removeClass('pos-left');
				if(( window.innerWidth - ($(this).offset().left+$(this).outerWidth(true)) < 340) && $(this).offset().left > 340){
					$(this).addClass('pos-left');
				};
				$(this).addClass('active');
			})
			.on('mouseleave', function(){
				$(this).removeClass('active');
			});
		/*tooltips*/
		
		/*like action*/
			$('.action-like .jlk').on('click', function(){
				$('.action-unlike .jlk span').removeAttr('style');
				$(this).find('span').css({'background-color':cactus.video_pro_main_color, 'color':'#FFFFFF'});
				$('.share-tool-block ~ style').remove();
			});
			$('.action-unlike .jlk').on('click', function(){
				$('.action-like .jlk span').removeAttr('style');
				$(this).find('span').css({'background-color':cactus.video_pro_main_color, 'color':'#FFFFFF'});
				$('.share-tool-block ~ style').remove();
			});
		/*like action*/
		
		/*screenShots Play*/			
			var speedScreenShots = 1000; //delay speed :ms
			$('body')
			.on('mouseenter touchstart', '.screenshots-preview-inline', function(){
				var $this = $(this);
				
				if($this.hasClass('screenshots-loaded')){
					if(!$this.hasClass('animation-ready')){
						var totalLength = $this.find('img').length;
						$this.find('img').each(function(index, element){											
							if(index > 0){
								var animationDelay = (index - 1) * speedScreenShots;	
								$(this).css({'-webkit-transition-delay':animationDelay+'ms', 'transition-delay':animationDelay+'ms',});
							}
						});					
					};
					
					if(!$this.hasClass('play-screenshots')){
						if($this.find('img.lazyload').length > 0 || $this.find('img.lazyloading').length > 0){
							return;
						}
						$('.screenshots-preview-inline').removeClass('play-screenshots');				
						$this.addClass('animation-ready play-screenshots');	
						return false;					
					};
				} else {
					// load screenshots
					data = 	{
						action: 'get_video_screenshots',
						post_id: $this.attr('data-post-id')
					};
					
					$this.addClass('downloading');
					
					if(!_ajax_loading){
						_ajax_loading = true;
						jQuery.ajax({
							  type: 'POST',
							  url: cactus.ajaxurl,
							  cache: false,
							  data: data,
							  context: $this,
							  success: function(data, textStatus, XMLHttpRequest){
								if(data != ''){
									$('.screenshots', $(this)).append(data);
								}

								$(this).addClass('screenshots-loaded');
								_ajax_loading = false;
								$this = $(this);
								$this.removeClass('downloading');
								setTimeout(function(){$this.trigger('mouseenter');},400);
							  },
							  error: function(MLHttpRequest, textStatus, errorThrown){
									$(this).addClass('screenshots-loaded');
									_ajax_loading = false;
									$this.removeClass('downloading');
							  }
						  });
					}
				}
			})
			.on('mouseleave', '.screenshots-preview-inline' , function(){
				$(this).removeClass('play-screenshots');
			})
			.on('touchstart', function(){
				$('.screenshots-preview-inline').removeClass('play-screenshots');
			});
		/*screenShots Play*/
		
		/*float video*/
			function floatVideoFunction(){
				var $wrapper_video = $('.cactus-post-format-video'),
					$fixed_video = $('.cactus-video-content-api');
					
				if($wrapper_video.length==0 || $fixed_video.length==0 || !$wrapper_video.hasClass('floating-video')){return;}
				
				var defaultWrapVideoWidth = $wrapper_video.width();
				var defaultWrapVideoHeight = $wrapper_video.outerHeight(true);
				var offsetVideoWrapper = $wrapper_video.offset().top + defaultWrapVideoHeight;
				
				var offsetFixedTop = $('#wpadminbar').height() + $('.sticky-menu.active').height();
				
				$('.cactus-video-content-api').css({
					'max-width'		:defaultWrapVideoWidth, 
					'max-height'	:defaultWrapVideoHeight,
				})
				
				if($(window).scrollTop() > offsetVideoWrapper+20){	
					$('.cactus-video-content-api').addClass('float-video');
					
					if(window.innerWidth<=600){
						
						$('.cactus-video-content-api').css({
							'position'		:'fixed', 
							'left'			:'100%', 
							'width'			:(window.innerWidth/2)+'px', 
							'height'		:(window.innerWidth/2*0.5625)+'px',						
							'top'			:($wrapper_video.hasClass('topright'))?offsetFixedTop+'px':'100%',
							'margin-top'	:($wrapper_video.hasClass('topright'))?offsetFixedTop+'px':'-'+(window.innerWidth/2*0.5625)+'px',
							'margin-left'	:'-'+(window.innerWidth/2)+'px',
						});
					}else if(window.innerWidth<=1024){
						$('.cactus-video-content-api').css({
							'position'		:'fixed', 
							'left'			:'100%', 
							'width'			:'340px', 
							'height'		:'191px',						
							'top'			:($wrapper_video.hasClass('topright'))?offsetFixedTop+'px':'100%',
							'margin-top'	:($wrapper_video.hasClass('topright'))?'0':'-191px',
							'margin-left'	:'-340px',
						});
					}else{
						$('.cactus-video-content-api').css({
							'position'		:'fixed', 
							'left'			:'100%', 
							'width'			:'340px', 
							'height'		:'191px',						
							'top'			:($wrapper_video.hasClass('topright'))?offsetFixedTop+'px':'100%',
							'margin-top'	:($wrapper_video.hasClass('topright'))?'0':'-191px',
							'margin-left'	:'-340px',
						});
					}
					
					/*if(($('#cactus-body-container').offset().top+$('#cactus-body-container').height()-200-offsetFixedTop)<$(window).scrollTop()){
						$('.cactus-video-content-api').hide();
					}else{
						$('.cactus-video-content-api').show();
					}*/
				}else{
					$('.cactus-video-content-api').removeClass('float-video').removeAttr('style');
				};	
			};		
			
			$('.close-video-floating').on('click', function(){
				$('.cactus-post-format-video').removeClass('floating-video topright bottomright');
				$('.cactus-video-content-api').removeClass('float-video').removeAttr('style');
			});	
		/*float video*/
		
		/*live comment*/
			$('.comment-content-wrap').mCustomScrollbar({
				theme:"dark",
				autoHideScrollbar:true,									
				mouseWheel:{scrollAmount: 100},
				scrollInertia:200,
			});
		/*live comment*/
		var $masonry_widget = $('.ct-medium .cactus-sidebar-content');
		function isotopeWidgetLayout(){						
			if(window.innerWidth<1024 && window.innerWidth>767){
				if(!$masonry_widget.hasClass('isotope-ready')){
					$masonry_widget.addClass('isotope-ready').isotope({
						itemSelector: 'aside.widget',
						percentPosition: true,
					});		
				}else{
					$masonry_widget.isotope('layout');
				};
			}else{
				if($masonry_widget.hasClass('isotope-ready')){
					$masonry_widget.removeClass('isotope-ready').isotope('destroy');	
				};				
			};
		};
		
        var $s_form = $('.cactus-header-search-form form');
		var $s_fn = $('.cactus-header-search-form input[type="text"][name="s"]');
		var $s_item = $('.cactus-header-search-form form i.fa');
        var $s_button = $('.cactus-header-search-form input[type="submit"]');

		$s_fn
		.on('focus', function(){
            if(!$s_fn.hasClass('onFocused')){
                $s_fn.addClass('onFocused');
                
                var is_rtl = $('body').hasClass('rtl-mode');
                if(is_rtl){
                    if(window.innerWidth > 1023){
                        var offsetLeft = $(this).offset().left;
                        var offsetRight = $('.cactus-nav-main .cactus-nav-right').width();
                        var current_width = $(this).width();
                        var width = offsetLeft - offsetRight + current_width - 70;
                        $s_form.css({'width':width+'px'});
                    }else{
                        $s_form.removeAttr('style');
                    };
                } else {
                    if(window.innerWidth > 1023){
                        var offsetLeft = $(this).offset().left;
                        var offsetRight = $('.cactus-nav-main .cactus-nav-right').offset().left - 40;
                        var width = offsetRight-offsetLeft;
                        
                        $s_form.css({'width':width+'px'});
                    }else{
                        $s_form.removeAttr('style');
                    };
                }
            }
		});
        
        $($s_fn, $s_button).on('click', function(evt){
            evt.stopPropagation();
        });
        
        $(window).on('mousedown', function(evt){
            // return the search box to its normal state
            if(evt.target.tagName == 'INPUT' && $(evt.target).attr('id') == 'searchsubmit'){
                $s_button.trigger('click');
            } else {
                $s_form.removeAttr('style');
            
                $s_fn.removeClass('onFocused');
            }
        });
		
		var __df_width = $window.width();
		$window
		.on('resize', function(){			
			if($window.width()==__df_width){
				return false;
			};
			
			$('body').removeClass('open-mobile-sidebar-ct');
			
			//setHeightWide();
			
			setTimeout(function(){
				resizeShare();
				resizeCarousel();
				msIESetHeightPlaylist();
				floatVideoFunction();	
				floating_widget(['.ct-medium', '.ct-small'], 'down');
			},200);
			isotopeWidgetLayout();
			
			__df_width = $window.width();
		})
		.on('scroll', function(){			
			scrollFunc();
			floatVideoFunction();
			//floating_widget(['.ct-medium', '.ct-small']);
		})
		.on('load', function(){
			//setHeightWide();
			isotopeWidgetLayout();
		});
		
		$.actionAutoNext();
        
        /* custom usermetadata */
        var usermeta_count = $('.cactus-account .metadata').length - 1;
        $(".cactua_add_account").click(function() {
            $('.cactus-account-header').removeClass('hidden');
            usermeta_count = usermeta_count + 1;

            $('.cactus-account').append('\
            <tr>\
                <td><input type="text" name="cactus_account['+usermeta_count+'][title]" id="title" value="" class="" /></td>\
                <td><input type="text" name="cactus_account['+usermeta_count+'][icon]" id="icon" value="" class="regular-text" /></td>\
                <td><input type="text" name="cactus_account['+usermeta_count+'][url]" id="url" value="" class="regular-text" /></td>\
                <td valign="top"><button class="custom-acc-remove button"><i class="fas fa-times"></i> x</button></td>\
            </tr>\
            ' );
            return false;
        });
        $(".custom-acc-remove").on('click', null, function() {
            $(this).parent().parent().remove();
        });
        
        $(window).scroll(function(e){
           if($(document).scrollTop() > $(window).height()){
               $('#gototop').removeClass('hidden');
           }else{
               $('#gototop').addClass('hidden');
           }
        });
        
        $('#gototop a').click(function(){
            jQuery('html,body,#body-wrap').animate({
					 scrollTop: $('a#top').offset().top
				}, 660);
        });
        
        $('.tml-profile-page .menu-items .item').on('click', function(evt){
            $('.tml-profile-page .tml-section').addClass('hidden');
            $($(this).attr('href')).removeClass('hidden');
            
            $('.tml-profile-page .menu-items .item').removeClass('active');
            $(this).addClass('active');
            
            evt.stopPropagation();
            return false;
        });
        
        setTimeout(function(){$('.fading_message').addClass('active');setTimeout(function(){$('.fading_message').removeClass('active');},5000);},1000);
        
        $('.ct-shortcode-sliderv3.sliderv11-sub .ct-icon-video').on('click', function(evt){
            if($(this).parent().next().hasClass('player-inline')){
                var thevideo = $('video', $(this).parent().next())[0];
                
                if(thevideo.paused) {
                    thevideo.play();
                } else {
                    thevideo.pause();
                }
                
                evt.stopPropagation();
                return false;
            }
        });

	}); // end documentReady
	
	$.actionAutoNext = function(){
		if(typeof(Cookies.get('actionautonextvideo'))!='undefined'){
			if(Cookies.get('actionautonextvideo')=='on'){
				$('.autoplay-group .autoplay-elms').addClass('active');
				return true;
			}else{
				$('.autoplay-group .autoplay-elms').removeClass('active');
				return false;
			};	
		}else{
			if($('.autoplay-group .autoplay-elms').hasClass('active')){
				return true;
			}else{
				return false;
			};
		};
	};
}(jQuery));

jQuery(document).ready(function($) {
	var locationHashComment = window.location.hash;
	var showElementstag = jQuery('.main-content-col.single-channel .combo-change, .main-content-col.single-channel .cactus-sub-wrap, .main-content-col.single-channel .category-tools, .cactus-listing-wrap .style-channel .page-navigation');
	if(locationHashComment!='' && locationHashComment!=null && typeof(locationHashComment)!='undefined' && locationHashComment.toString().split("-").length == 2){
		showElementstag.css({'display':'none'});
		jQuery('.main-content-col.single-channel .discus-none').show();
		jQuery('.main-content-col.single-channel .channel-menu-item').removeClass('active');
		jQuery('.main-content-col.single-channel .channel-menu-item').eq(2).addClass('active');
	};
	
	if($('.live-comment').length==0){
		return;
	}					
	var $videopro_livecm_post_id = jQuery('#comments input[name="videopro_livecm_post_id"]').val();
	var $videopro_livecm_crtime = jQuery('#comments input[name="videopro_livecm_crtime"]').val();
	var $videopro_livecm_refre = jQuery('#comments input[name="videopro_livecm_refre"]').val();
	var $videopro_livecm_nuurl = jQuery('#comments input[name="videopro_livecm_nuurl"]').val();
	var $videopro_livecm_url_more = jQuery('#comments input[name="videopro_livecm_url_more"]').val();
	
	var $videopro_text_plst = jQuery('#comments input[name="videopro_text_plst"]').val();
	var $videopro_text_dlc = jQuery('#comments input[name="videopro_text_dlc"]').val();
	var $videopro_text_tfy = jQuery('#comments input[name="videopro_text_tfy"]').val();
	var $videopro_text_plwa = jQuery('#comments input[name="videopro_text_plwa"]').val();
	function testSpaceBar(obj){
		if(obj.value=="")return false;
		else{		
			var s = obj.value;
			var temp = s.split(" ");
			var str = "";
			for(var i=0; i<temp.length; i++)str=str + temp[i];
			if(str==""){
				obj.value = str.substring(0,str.length);
				return false;
			}
		}
		return true;
	};
	
	jQuery('#commentform').submit(function(){
		if(jQuery(this).find('.logged-in-as').length > 0) {
			if(!testSpaceBar(document.getElementById('comment'))) {								
				return false;
			}else{
				jQuery(this).find('#submit').css({'opacity':'0.5', 'pointer-events':'none'});
			};
		}else{
			if(!testSpaceBar(document.getElementById('email')) || !testSpaceBar(document.getElementById('comment')) || !testSpaceBar(document.getElementById('author')) ) {								
				return false;
			}else{
				jQuery(this).find('#submit').css({'opacity':'0.5', 'pointer-events':'none'});
			};
		};
	});
											
	function formatNumber (num) {return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,");};
	function isNumber(n) {return !isNaN(parseFloat(n)) && isFinite(n);};
	function replaceAll(find, replace, str) {return str.replace(new RegExp(find, 'g'), replace);}
	
	var id_comment = "#load-comment-"+$videopro_livecm_post_id;	
	function checkNumberCommentPlus(data){
		var defaultNumber = replaceAll(',','',jQuery(id_comment).parents('#comments').find('#tdt-f-number-calc').text());
		if(isNumber(defaultNumber)) {
			jQuery(id_comment).parents('#comments').find('#tdt-f-number-calc').text(formatNumber(parseFloat(defaultNumber)+(data.split('<!-- #comment-## -->').length-1)));
		};
	};
	
	function setIDDateComments(){
		var strListID = '';
		var lengthComments = jQuery('#comments .comment').length;
		jQuery('#comments .comment').each(function(index, element) {
			var commentID = $(this).attr('id');
			if(index == lengthComments-1){
				strListID+=(commentID.split('-')[1]);
			}else{
				strListID+=(commentID.split('-')[1])+',';
			}
		});
		
		jQuery('#list_cm').val(strListID);
	}
	var intDate=0;
	var nowDate = 
	intDate = new Date().getTime();
	
	
	var refreshId;
	function createAutoRefresh(){
		$dateim = $videopro_livecm_crtime;
		$i =0;		
		refreshId = setInterval(function(){
				$i ++;
				if($i>1){
					$dateim = Math.round((parseFloat($dateim) + 10));
				}
				$idliscm = jQuery('#list_cm').val();
				var $url = $videopro_livecm_nuurl+"&idlist="+($idliscm)+'&dateim='+($dateim);
				$url = ($url.split("amp;").join(""));
				jQuery.get($url, function( data ) {							
					jQuery(".comment-list").prepend(data);
					setIDDateComments();
					checkNumberCommentPlus(data);
				});
		}, 10000);
	};
	createAutoRefresh();
	function clearInterValAutoRefresh(){
		if(refreshId!=null) {
			clearInterval(refreshId);
		};
	};
	
	jQuery(id_comment).click(function(){
		$idliscm = jQuery('#list_cm').val();
		$page_cm = jQuery('#page_cm').val();
		var $url = $videopro_livecm_url_more+"&idlist="+($idliscm)+"&page="+($page_cm);
		$url = ($url.split("amp;").join(""));
		clearInterValAutoRefresh();
		jQuery(id_comment).css({'pointer-events':'none'});
		jQuery(id_comment).find('.load-title').hide();
		jQuery(id_comment).find('.fa-refresh').removeClass('hide').addClass('fa-spin');
		
		jQuery.get($url, function( data ) {
			jQuery(".comment-list").append(data);
			setIDDateComments();
			jQuery(id_comment).css({'pointer-events':'auto'});
			jQuery(id_comment).find('.load-title').show();
			jQuery(id_comment).find('.fa-refresh').addClass('hide').removeClass('fa-spin');
			createAutoRefresh();
			if(data=='') {
				jQuery(id_comment).remove();
			};
		});
	});
	
	/*-ajax comment-*/
	var commentform=$('#commentform'); /*-find the comment form-*/
	var statusdiv=$('#comment-status'); /*-define the infopanel-*/

	commentform.submit(function(){
		/*-serialize and store form data in a variable-*/
		var formdata=commentform.serialize();
		if($('input[name=comment]').val()==''){
			statusdiv.html('<p class="ajax-error" >'+$videopro_text_pls+'</p>');
			$('#commentform #submit').removeAttr("style");
			return false;
		}
		/*-Add a status message-*/
		statusdiv.html('<p>Processing...</p>');
		/*-Extract action URL from commentform-*/
		var formurl=commentform.attr('action');
		/*-Post Form with data-*/
		$.ajax({
			type: 'post',
			url: formurl,
			data: formdata,
			error: function(XMLHttpRequest, textStatus, errorThrown)
				{
					statusdiv.html('<p class="ajax-error" >'+$videopro_text_dlc+'</p>');
					$('#commentform #submit').removeAttr("style");
					$('#cancel-comment-reply-link').trigger('click');
				},
			success: function(data, textStatus){
				if(data == "success" || textStatus == "success"){
					statusdiv.html('<p class="ajax-success" >'+$videopro_text_tfy+'</p>');
					commentform.find('input[name=comment]').val('');
					$('#cancel-comment-reply-link').trigger('click');
				}else{
					statusdiv.html('<p class="ajax-error" >'+$videopro_text_plwa+'</p>');
					commentform.find('input[name=comment]').val('');
					$('#cancel-comment-reply-link').trigger('click');
				}
				$('#commentform #submit').removeAttr("style");							
			}
		});
		return false;
	});
});
jQuery(document).ready(function($) {
    $('.dropbtn').on('click', function(e) {
        $('#dropdown-menu-series').toggleClass("show");
	 	e.preventDefault();
        e.stopPropagation();
	 });

    $(window).click(function(e) {
        if (!$(this).hasClass(".dropbtn")) {
            $(".dropdown-menu").removeClass("show");
        }
    });
});

jQuery(window).on('load', null, function (e) {
	/*
	 * Pre-Loading
	 * */
	jQuery("#pageloader").fadeOut(500);

});

jQuery("body").removeClass("preload");