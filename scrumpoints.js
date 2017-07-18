(function() {
	init();
})();


function init() {

	try	{
		// For MutationObserver
		var obsConfig = { childList: true, characterData: true, attributes: false, subtree: true };

		//default story point picker sequence (can be overridden in the Scrum for Trello 'Settings' popup)
		const _pointSeq = ['?', 0, .5, 1, 2, 3, 5, 8, 13, 21, 100];

		//attributes representing points values for card
		const _pointsAttr = ['cpoints', 'points'];

		// All settings and their defaults.
		var S4T_SETTINGS = [];
		const SETTING_NAME_LINK_STYLE = "burndownLinkStyle";
		const SETTING_NAME_ESTIMATES = "estimatesSequence";
		const S4T_ALL_SETTINGS = [SETTING_NAME_LINK_STYLE, SETTING_NAME_ESTIMATES];
		var S4T_SETTING_DEFAULTS = {};
		S4T_SETTING_DEFAULTS[SETTING_NAME_LINK_STYLE] = 'full';
		S4T_SETTING_DEFAULTS[SETTING_NAME_ESTIMATES] = _pointSeq.join();
		refreshSettings(); // get the settings right away (may take a little bit if using Chrome cloud storage)

		//internals
		var reg = /((?:^|\s?))\((\x3f|\d*\.?\d+)(\))\s?/m; //parse regexp- accepts digits, decimals and '?', surrounded by ()
		var regC = /((?:^|\s?))\[(\x3f|\d*\.?\d+)(\])\s?/m; //parse regexp- accepts digits, decimals and '?', surrounded by []

		function round(_val) {return (Math.round(_val * 100) / 100)};

		// Some browsers have serious errors with MutationObserver (eg: Safari doesn't have it called MutationObserver).
		var CrossBrowser = {
			init: function(){
				this.MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver || null;
			}
		};
		CrossBrowser.init();

		//what to do when DOM loads
		$(function(){
			//watch filtering
			function updateFilters() {
				setTimeout(calcListPoints);
			};
			$('.js-toggle-label-filter, .js-select-member, .js-due-filter, .js-clear-all').off('mouseup');
			$('.js-toggle-label-filter, .js-select-member, .js-due-filter, .js-clear-all').on('mouseup', calcListPoints);
			$('.js-input').off('keyup');
			$('.js-input').on('keyup', calcListPoints);
			$('.js-share').off('mouseup');

			calcListPoints();
		});

		// Recalculates every card and its totals (used for significant DOM modifications).
		var recalcListAndTotal = debounce(function($el){
		    ($el||$('.list')).each(function(){
				if(!this.list) new List(this);
				else if(this.list.refreshList){
					this.list.refreshList(); // make sure each card's points are still accurate (also calls list.calc()).
				}
			})
		}, 500, false);

		var recalcTotalsObserver = new CrossBrowser.MutationObserver(function(mutations)
		{
			// Determine if the mutation event included an ACTUAL change to the list rather than
			// a modification caused by this extension making an update to points, etc. (prevents
			// infinite recursion).
			var doFullRefresh = false;
			var refreshJustTotals = false;
			$.each(mutations, function(index, mutation){
				var $target = $(mutation.target);

				// Ignore a bunch of known cases that send mutation events which don't require us to recalcListAndTotal.
				if(! ($target.hasClass('list-total')
					  || $target.hasClass('list-title')
					  || $target.hasClass('list-header')
					  || $target.hasClass('date') // the 'time-ago' functionality changes date spans every minute
					  || $target.hasClass('js-phrase') // this is constantly updated by Trello, but doesn't affect estimates.
		              || $target.hasClass('member')
		              || $target.hasClass('clearfix')
		              || $target.hasClass('badges')
					  || $target.hasClass('header-btn-text')
		              || (typeof mutation.target.className == "undefined")
					  ))
				{
					if($target.hasClass('badge')){
		                if(!$target.hasClass("consumed")){
		    				refreshJustTotals = true;
		                }
					} else {
						// It appears this was an actual modification and not a recursive notification.
						doFullRefresh = true;
					}
				}
			});
			
			if(doFullRefresh){
				recalcListAndTotal();
			} else if(refreshJustTotals){
				calcListPoints();
			}
		    
			// There appears to be a change to have the card-title always be a textarea. We'll allow for either way, to
			// start (in case this is A/B testing, or they don't keep it). 20160409
		    $editControls = $(".card-detail-title .edit-controls"); // old selector
			if($editControls.length == 0){
				$editControls = $(".js-card-detail-title-input.is-editing").closest('.window-header'); // new selector
			}
		    if($editControls.length > 0)
		    {
		        showPointPicker($editControls.get(0));
		    }
		});
		recalcTotalsObserver.observe(document.body, obsConfig);

		var ignoreClicks = function(){ return false; };
		function showBurndown()
		{
		    $('body').addClass("window-up");
		    $('.window').css("display", "block").css("top", "50px");

			// Figure out the current user and board.
			$memberObj = $('.header-user .member-avatar');
			if($memberObj.length == 0){
				$memberObj = $('.header-user .member-initials'); // if the user doesn't have an icon
			}
			var username = $memberObj.attr('title').match(/\(([^\)\(]*?)\)$/)[1];

			// Find the short-link board name, etc. so that the back-end can figure out what board this is.
			var shortLink = document.location.href.match(/b\/([A-Za-z0-9]{8})\//)[1];
			var boardName = "";
			boardName = $('.board-name span.text').text().trim();

			// Build the dialog DOM elements. There are no unescaped user-provided strings being used here.
			var clearfix = $('<div/>', {class: 'clearfix'});
			var windowHeaderUtils = $('<div/>', {class: 'window-header-utils dialog-close-button'}).append( $('<a/>', {class: 'icon-lg icon-close dark-hover js-close-window', href: '#', title:'Close this dialog window.'}) );
			var iFrameWrapper = $('<div/>', {style: 'padding:10px; padding-top: 13px;'});
		    
			var actualIFrame = $('<iframe/>', {frameborder: '0',
								 style: 'width: 691px; height: 820px;',
								 id: 'burndownFrame',
								 src: "https://www.burndownfortrello.com/s4t_burndownPopup.php?username="+encodeURIComponent(username)+"&shortLink="+encodeURIComponent(shortLink)+"&boardName="+encodeURIComponent(boardName)
								});
			var loadingFrameIndicator = $('<span/>', {class: 'js-spinner', id: 'loadingBurndownFrame', style: 'position: absolute; left: 225px; top: 260px;'}).append($('<span/>', {class: 'spinner left', style: 'margin-right:4px;'})).append("Loading 'Burndown for Trello'...");
			iFrameWrapper.append(loadingFrameIndicator); // this will show that the iframe is loading... until it loads.
			iFrameWrapper.append(actualIFrame);
		    actualIFrame.css("visibility", "hidden");
			$windowWrapper = $('.window-wrapper');
		    $windowWrapper.click(ignoreClicks);
			$windowWrapper.empty().append(clearfix).append(windowHeaderUtils).append(iFrameWrapper);
			$('#burndownFrame').load(function(){ $('#loadingBurndownFrame').remove(); actualIFrame.css("visibility", "visible"); }); // once the iframe loads, get rid of the loading indicator.
			$('.window-header-utils a.js-close-window').click(hideBurndown);
		    //$(window).bind('resize', repositionBurndown);
		    $('.window-overlay').bind('click', hideBurndown);
		    
		    //repositionBurndown();
		}

		var settingsFrameId = 'settingsFrame';

		function hideBurndown()
		{
		    $('body').removeClass("window-up");
		    $('.window').css("display", "none");
		    //$(window).unbind('resize', repositionBurndown);
			$('.window-header-utils a.js-close-window').unbind('click', hideBurndown);
			$('.window-wrapper').unbind('click', ignoreClicks);
		    $('.window-overlay').unbind('click', hideBurndown);
		}

		//calculate list totals
		var lto;
		function calcListPoints(){
			clearTimeout(lto);
			lto = setTimeout(function(){
				$('.list').each(function(){
					if(!this.list) new List(this);
					else if(this.list.calc) this.list.calc();
				});
			});
		};

		//.list pseudo
		function List(el){
			if(el.list)return;
			el.list=this;

			var $list=$(el),
				$total=$('<span class="list-total">'),
				busy = false,
				to;

			function readCard($c){
				if($c.target) {
					if(!/list-card/.test($c.target.className)) return;
					$c = $($c.target).filter('.list-card:not(.placeholder)');
				}
				$c.each(function(){
					if(!this.listCard) for (var i in _pointsAttr){
						new ListCard(this,_pointsAttr[i]);
					} else {
						for (var i in _pointsAttr){
							setTimeout(this.listCard[_pointsAttr[i]].refresh);
						}
					}
				});
			};

			// All calls to calc are throttled to happen no more than once every 500ms (makes page-load and recalculations much faster).
			var self = this;
			this.calc = debounce(function(){
				self._calcInner();
		    }, 500, true); // executes right away unless over its 500ms threshold since the last execution
			this._calcInner	= function(e){ // don't call this directly. Call calc() instead.
				//if(e&&e.target&&!$(e.target).hasClass('list-card')) return; // TODO: REMOVE - What was this? We never pass a param into this function.
				clearTimeout(to);
				to = setTimeout(function(){
					$total.empty().appendTo($list.find('.list-title,.list-header'));
					for (var i in _pointsAttr){
						var score=0,
							attr = _pointsAttr[i];
						$list.find('.list-card:not(.placeholder)').each(function(){
							if(!this.listCard) return;
							if(!isNaN(Number(this.listCard[attr].points))){
								// Performance note: calling :visible in the selector above leads to noticible CPU usage.
								if(jQuery.expr.filters.visible(this)){
									score+=Number(this.listCard[attr].points);
								}
							}
						});
						var scoreTruncated = round(score);
						var scoreSpan = $('<span/>', {class: attr}).text( (scoreTruncated>0) ? scoreTruncated : '' );
						$total.append(scoreSpan);
						// computeTotal();
					}
				});
			};
		    
		    this.refreshList = debounce(function(){
		        readCard($list.find('.list-card:not(.placeholder)'));
		        this.calc(); // readCard will call this.calc() if any of the cards get refreshed.
		    }, 500, false);

			var cardAddedRemovedObserver = new CrossBrowser.MutationObserver(function(mutations)
			{
				// Determine if the mutation event included an ACTUAL change to the list rather than
				// a modification caused by this extension making an update to points, etc. (prevents
				// infinite recursion).
				$.each(mutations, function(index, mutation){
					var $target = $(mutation.target);
					
					// Ignore a bunch of known elements that send mutation events.
					if(! ($target.hasClass('list-total')
							|| $target.hasClass('list-title')
							|| $target.hasClass('list-header')
							|| $target.hasClass('badge-points')
							|| $target.hasClass('badges')
							|| (typeof mutation.target.className == "undefined")
							))
					{
						var list;
						// It appears this was an actual mutation and not a recursive notification.
						$list = $target.closest(".list");
						if($list.length > 0){
							list = $list.get(0).list;
							if(!list){
								list = new List(mutation.target);
							}
							if(list){
								list.refreshList(); // debounced, so its safe to call this multiple times for the same list in this loop.
							}
						}
					}
				});
			});

		    cardAddedRemovedObserver.observe($list.get(0), obsConfig);

			setTimeout(function(){
				readCard($list.find('.list-card'));
				setTimeout(el.list.calc);
			});
		};

		//.list-card pseudo
		function ListCard(el, identifier){
			if(el.listCard && el.listCard[identifier]) return;

			//lazily create object
			if (!el.listCard){
				el.listCard={};
			}
			el.listCard[identifier]=this;

			var points=-1,
				consumed=identifier!=='points',
				regexp=consumed?regC:reg,
				parsed,
				that=this,
				busy=false,
				$card=$(el),
				$badge=$('<div class="badge badge-points point-count"/>'),
				to,
				to2;

			// MutationObservers may send a bunch of similar events for the same card (also depends on browser) so
			// refreshes are debounced now.
			var self = this;
			this.refresh = debounce(function(){
				self._refreshInner();
		    }, 250, true); // executes right away unless over its 250ms threshold
			this._refreshInner=function(){
				if(busy) return;
				busy = true;
				clearTimeout(to);

				to = setTimeout(function(){
					var $title=$card.find('.js-card-name');
					if(!$title[0])return;
					// This expression gets the right value whether Trello has the card-number span in the DOM or not (they recently removed it and added it back).
					var titleTextContent = (($title[0].childNodes.length > 1) ? $title[0].childNodes[$title[0].childNodes.length-1].textContent : $title[0].textContent);
					if(titleTextContent) el._title = titleTextContent;
					
					// Get the stripped-down (parsed) version without the estimates, that was stored after the last change.
					var parsedTitle = $title.data('parsed-title'); 

					if(titleTextContent != parsedTitle){
						// New card title, so we have to parse this new info to find the new amount of points.
						parsed=titleTextContent.match(regexp);
						points=parsed?parsed[2]:-1;
					} else {
						// Title text has already been parsed... process the pre-parsed title to get the correct points.
						var origTitle = $title.data('orig-title');
						parsed=origTitle.match(regexp);
						points=parsed?parsed[2]:-1;
					}

					clearTimeout(to2);
					to2 = setTimeout(function(){
						// Add the badge (for this point-type: regular or consumed) to the badges div.
						$badge
							.text(that.points)
							[(consumed?'add':'remove')+'Class']('consumed')
							.attr({title: 'This card has '+that.points+ (consumed?' consumed':'')+' storypoint' + (that.points == 1 ? '.' : 's.')})
							.prependTo($card.find('.badges'));

						// Update the DOM element's textContent and data if there were changes.
						if(titleTextContent != parsedTitle){
							$title.data('orig-title', titleTextContent); // store the non-mutilated title (with all of the estimates/time-spent in it).
						}
						parsedTitle = $.trim(el._title.replace(reg,'$1').replace(regC,'$1'));
						el._title = parsedTitle;
						$title.data('parsed-title', parsedTitle); // save it to the DOM element so that both badge-types can refer back to it.
						if($title[0].childNodes.length > 1){
							$title[0].childNodes[$title[0].childNodes.length-1].textContent = parsedTitle; // if they keep the card numbers in the DOM
						} else {
							$title[0].textContent = parsedTitle; // if they yank the card numbers out of the DOM again.
						}
						var list = $card.closest('.list');
						if(list[0]){
							list[0].list.calc();
						}
						busy = false;
					});
				});
			};

			this.__defineGetter__('points',function(){
				return parsed?points:''
			});

			var cardShortIdObserver = new CrossBrowser.MutationObserver(function(mutations){
				$.each(mutations, function(index, mutation){
					var $target = $(mutation.target);
					if(mutation.addedNodes.length > 0){
						$.each(mutation.addedNodes, function(index, node){
							if($(node).hasClass('card-short-id')){
								// Found a card-short-id added to the DOM. Need to refresh this card.
								var listElement = $target.closest('.list').get(0);
								if(!listElement.list) new List(listElement); // makes sure the .list in the DOM has a List object

								var $card = $target.closest('.list-card');
								if($card.length > 0){
									var listCardHash = $card.get(0).listCard;
									if(listCardHash){
										// The hash contains a ListCard object for each type of points (cpoints, points, possibly more in the future).
										$.each(_pointsAttr, function(index, pointsAttr){
											listCardHash[pointsAttr].refresh();
										});
									}
								}
							}
						});
					}
				});
			});

			// The MutationObserver is only attached once per card (for the non-consumed-points ListCard) and that Observer will make the call
			// to update BOTH types of points-badges.
			if(!consumed){
				var observerConfig = { childList: true, characterData: false, attributes: false, subtree: true };
				cardShortIdObserver.observe(el, observerConfig);
			}

			setTimeout(that.refresh);
		};

		//the story point picker
		function showPointPicker(location) {
			if($(location).find('.picker').length) return;
			
			// Try to allow this to work with old card style (with save button) or new style (where title is always a textarea).
			var $elementToAddPickerTo = $('.card-detail-title .edit-controls');
			if($elementToAddPickerTo.length == 0){
				$elementToAddPickerTo = $(".js-card-detail-title-input").closest('.window-header');
			}

			var $picker = $('<div/>', {class: "picker"}).appendTo($elementToAddPickerTo.get(0));
			$picker.append($('<span>', {class: "picker-title"}).text("Estimated Points : "));
			
			var estimateSequence = (S4T_SETTINGS[SETTING_NAME_ESTIMATES].replace(/ /g, '')).split(',');
			for (var i in estimateSequence) $picker.append($('<span>', {class: "point-value"}).text(estimateSequence[i]).click(function(){
				var value = $(this).text();
				var $text = $('.card-detail-title .edit textarea'); // old text-areas
				if($text.length == 0){
					$text = $('textarea.js-card-detail-title-input'); // new text-area
				}
				var text = $text.val();

				// replace estimates in card title
				$text[0].value=text.match(reg)?text.replace(reg, '('+value+') '):'('+value+') ' + text;

				// in old-textarea method, click our button so it all gets saved away
				$(".card-detail-title .edit .js-save-edit").click();
				// in new-textarea method, have to do a few actions to get it to save after we click away from the card
				$('textarea.js-card-detail-title-input').click();
				$('textarea.js-card-detail-title-input').focus();

				return false;
			}));
			
			if($(location).find('.picker-consumed').length) return;
			var $pickerConsumed = $('<div/>', {class: "picker-consumed"}).appendTo($elementToAddPickerTo.get(0));
			$pickerConsumed.append($('<span>', {class: "picker-title"}).text("Consumed Points : "));

			var consumedSequence = (S4T_SETTINGS[SETTING_NAME_ESTIMATES]).split(',');
			for (var i in consumedSequence) $pickerConsumed.append($('<span>', {class: "point-value"}).text(consumedSequence[i]).click(function(){
				var value = $(this).text();
				var $text = $('.card-detail-title .edit textarea'); // old text-areas
				if($text.length == 0){
					$text = $('textarea.js-card-detail-title-input'); // new text-area
				}
				var text = $text.val();

				// replace consumed value in card title
				$text[0].value=text.match(regC)?text.replace(regC, ' ['+value+']'):text + ' ['+value+']';

				// in old-textarea method, click our button so it all gets saved away
				$(".card-detail-title .edit .js-save-edit").click();
				// in new-textarea method, have to do a few actions to get it to save after we click away from the card
				$('textarea.js-card-detail-title-input').click();
				$('textarea.js-card-detail-title-input').focus();

				return false;
			}));
		};


		//for export
		var $excel_btn,$excel_dl;
		
		// for settings

		function useChromeStorage(){
			return ((typeof chrome !== "undefined") && (typeof chrome.storage !== "undefined"));
		}

		/**
		 * Saves the Setting (defined by 'settingName') to be whatever is in 'settingValue'.
		 *
		 * This will use Chrome cloud-storage if available, then will fall back to LocalStorage
		 * if possible and fall back to cookies otherwise.
		 *
		 * NOTE: Remember to enver store confidential or user information in Chrome cloud
		 * storage (it's not encrypted).
		 */
		function saveSetting(settingName, settingValue){
			// Use Chrome cloud storage where available (will sync across multiple computers).
			if(useChromeStorage()){
				var objectToPersist = {}; // can't use an object-literal to do it, or chrome will make an object whose key is literally 'settingName'
				objectToPersist[settingName] = settingValue;
				chrome.storage.sync.set(objectToPersist, function() {
					// console.log("Chrome saved " + settingName + ".");
				});
			} else if(typeof(Storage) !== "undefined"){
				localStorage[settingName] = settingValue;
			} else {
				// No LocalStorage support... use cookies instead.
				setCookie(settingName, settingValue);
			}
		} // end saveSetting()

		/**
		 * Retrieves the Setting defined by 'settingName'. The 'defaultValue' is optional.
		 *
		 * This will use LocalStorage if possible and fall back to cookies otherwise. Typically
		 * this function will only be used if Chrome cloud storage is not available.
		 */
		function getSetting(settingName, defaultValue){
			var retVal = defaultValue;
			if(typeof(Storage) !== "undefined"){
				var lsValue = localStorage[settingName];
				if(typeof lsValue !== 'undefined'){
					retVal = lsValue;
				}
			} else {
				// No LocalStorage support... use cookies instead.
				retVal = getCookie(settingName, defaultValue);
			}
			return retVal;
		}; // end getSetting()

		/**
		 * Refreshes all of the persisted settings and puts them in memory. This is
		 * done at the beginning, and any time chrome cloud-storage sends an event
		 * that the data has changed.
		 */
		function refreshSettings(){
			if(useChromeStorage()){
				chrome.storage.sync.get(S4T_ALL_SETTINGS, function(result){
					//if(chrome.runtime.lastError){}
					$.each(S4T_ALL_SETTINGS, function(i, settingName){
						if(result[settingName]){
							S4T_SETTINGS[settingName] = result[settingName];
						} else {
							S4T_SETTINGS[settingName] = S4T_SETTING_DEFAULTS[settingName];
						}
					});
					onSettingsUpdated();
				});
			} else {
				// Get the settings (with defaults for each). Add a new line here for every new setting.
				$.each(S4T_ALL_SETTINGS, function(i, settingName){
					S4T_SETTINGS[settingName] = getSetting(settingName, S4T_SETTING_DEFAULTS[settingName]);
				});
				onSettingsUpdated();
			}
		}; // end refreshSettings()

		function onSettingsUpdated(){
			// Temporary indication to the user that the settings were saved (might not always be on screen, but that's not a problem).
			$('#'+settingsFrameId).contents().find('#s4tSaved').show().fadeOut(2000, "linear");
			
			// Refresh the links because link-settings may have changed.
			$('.s4tLink').remove();
		} // end onSettingsUpdated()

		/**
		 * Sets a key/value cookie to live for about a year. Cookies are typically not used by
		 * this extension if LocalSettings is available in the browser.
		 * From: http://www.w3schools.com/js/js_cookies.asp
		 */
		function setCookie(c_name,value){
			var exdays = 364;
			var exdate=new Date();
			exdate.setDate(exdate.getDate() + exdays);
			var c_value=escape(value) + ((exdays==null) ? "" : "; expires="+exdate.toUTCString());
			document.cookie=c_name + "=" + c_value;
		}; // end setCookie()

		/**
		 * Gets a cookie value if available (defaultValue if not found). Cookies are typically not\
		 * used by this extension if LocalSettings is available in the browser.
		 * Basically from: http://www.w3schools.com/js/js_cookies.asp
		 */
		function getCookie(c_name, defaultValue){
			var c_value = document.cookie;
			var c_start = c_value.indexOf(" " + c_name + "=");
			if (c_start == -1){
				c_start = c_value.indexOf(c_name + "=");
			}
			if (c_start == -1){
				c_value = defaultValue;
			} else {
				c_start = c_value.indexOf("=", c_start) + 1;
				var c_end = c_value.indexOf(";", c_start);
				if (c_end == -1) {
					c_end = c_value.length;
				}
				c_value = unescape(c_value.substring(c_start,c_end));
			}
			return c_value;
		}; // end getCookie()


		/* ============================== Helper functions ========================================== */

		// Config Debounce 
		// Returns a function, that, as long as it continues to be invoked, will not
		// be triggered. The function will be called after it stops being called for
		// N milliseconds. If `immediate` is passed, trigger the function on the
		// leading edge, instead of the trailing.

		function debounce(func, wait, immediate) { // FROM : https://davidwalsh.name/javascript-debounce-function
			var timeout;
			return function() {
				var context = this, args = arguments;
				var later = function() {
					timeout = null;
					if (!immediate) func.apply(context, args);
				};
				var callNow = immediate && !timeout;
				clearTimeout(timeout);
				timeout = setTimeout(later, wait);
				if (callNow) func.apply(context, args);
			};
		};


	} catch(e) {}
}
