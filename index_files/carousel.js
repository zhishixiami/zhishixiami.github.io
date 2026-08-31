/*
 * 图片轮播组件 —— 由 config.js 中的 photos 配置驱动
 * 点开爱情树（树木生长完成后）调用 window.showPhotoCarousel() 淡入并自动播放
 */
(function ($) {
    function initPhotoCarousel() {
        var $carousel = $('#photo-carousel');
        if (!$carousel.length || !window.config || !config.photos || !config.photos.length) {
            return;
        }
        var photos = config.photos;
        var $track = $carousel.find('.carousel-track');
        var $dots = $carousel.find('.carousel-dots');
        var count = photos.length;
        var index = 0;
        var timer = null;

        // 生成幻灯片 + 指示点
        photos.forEach(function (p, i) {
            var $slide = $('<div class="carousel-slide' + (i === 0 ? ' active' : '') + '"></div>');
            $('<img>').attr({
                src: p.src,
                alt: p.caption || '',
                draggable: 'false'
            }).appendTo($slide);
            if (p.caption) {
                $('<div class="carousel-caption"></div>').text(p.caption).appendTo($slide);
            }
            $track.append($slide);
            $dots.append('<span class="carousel-dot' + (i === 0 ? ' active' : '') + '" data-index="' + i + '"></span>');
        });

        function go(n) {
            n = ((n % count) + count) % count;
            $track.find('.carousel-slide').eq(index).removeClass('active');
            $dots.find('.carousel-dot').eq(index).removeClass('active');
            index = n;
            $track.find('.carousel-slide').eq(index).addClass('active');
            $dots.find('.carousel-dot').eq(index).addClass('active');
        }
        function next() { go(index + 1); }
        function prev() { go(index - 1); }

        function start() {
            stop();
            if (count > 1) {
                timer = setInterval(next, 4500);
            }
        }
        function stop() {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
        }

        // 左右按钮
        $carousel.find('.carousel-prev').on('click', function (e) {
            e.preventDefault(); prev();
        });
        $carousel.find('.carousel-next').on('click', function (e) {
            e.preventDefault(); next();
        });
        // 指示点
        $dots.on('click', '.carousel-dot', function () {
            go(parseInt($(this).attr('data-index'), 10));
        });
        // 悬停暂停 / 移开继续
        $carousel.on('mouseenter', stop).on('mouseleave', start);
        // 移动端滑动切换
        var touchX = 0;
        $carousel.on('touchstart', function (e) {
            touchX = e.originalEvent.touches[0].clientX;
        }).on('touchend', function (e) {
            var dx = e.originalEvent.changedTouches[0].clientX - touchX;
            if (Math.abs(dx) > 40) {
                dx < 0 ? next() : prev();
            }
        });
        // 键盘左右键切换
        $(document).on('keydown', function (e) {
            if (!$carousel.is(':visible')) { return; }
            if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
            if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
        });

        // 供外部调用：点开爱情树后淡入并开始播放
        window.showPhotoCarousel = function () {
            $carousel.css('display', 'block').addClass('in');
            start();
        };
    }

    $(initPhotoCarousel);
})(jQuery);
