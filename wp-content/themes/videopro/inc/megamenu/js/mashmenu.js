;(function($){
	$.cactus_megamenu = function(){
		$('.sub-menu-box.preview-mode').each(function(index, element) {
			var channel_content = '';
			var channel_count = 0;
			$(this).find('.channel-content').each(function(index, element) {
				if(channel_count == 0){
					$(this).addClass('active');
				}
				channel_content += $(this)[0].outerHTML;
				$(this).remove();
				channel_count++;
			});
			$(this).append(channel_content);
		});    
		
		$('.dropdown-mega > a').click(function(){return false;});
		
		if(navigator.userAgent.match(/(Android|iPod|iPhone|iPad|IEMobile|Opera Mini)/)){
			$('.sub-menu-box .channel-title > a').bind('touchstart', function(event){
				var __this = $(this);
				var __parents = __this.parents('.sub-menu-box');	
				var parentTouchStart = $(this).parents('.channel-title');
				var target = "#" + parentTouchStart.attr("data-target");
				$(".channel-content", __parents).removeClass("active");
				$(target).addClass("active");
				return false;
			});
		}else{
			$('.sub-menu-box .channel-title').hover(
				function(){
					var __this = $(this);
					var __parents = __this.parents('.sub-menu-box');				
					var target = "#" + $(this).attr("data-target");
					$(".channel-content", __parents).removeClass("active");
					$(target).addClass("active");
				},
				function(){}
			);
		};
	};
	
	$(document).ready(function(e) {
		$.cactus_megamenu();
	});
}(jQuery));