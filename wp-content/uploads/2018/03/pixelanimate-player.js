var particleAlphabet = {
		Particle: function(x, y) {
			this.x = x;
			this.y = y;
			this.radius = 3.5;
			var color='white';
			this.draw = function(ctx) {
				ctx.save();
				ctx.translate(this.x, this.y);
				ctx.fillStyle = 'white';
				ctx.fillRect(0, 0, this.radius, this.radius);
				ctx.restore();
			};
		},
		init: function() {
			particleAlphabet.canvas = document.querySelector('#logo-canvas');
			particleAlphabet.ctx = particleAlphabet.canvas.getContext('2d');
			particleAlphabet.W = 768;
			particleAlphabet.H = 440;
			particleAlphabet.loop = true;
			particleAlphabet.particles = [];
			particleAlphabet.canvas.width = particleAlphabet.W;
			particleAlphabet.canvas.height = particleAlphabet.H;
			particleAlphabet.makeParticles(7000);
			particleAlphabet.frameCtr = 0;
			particleAlphabet.animate();
		}, 
		currentPos: -1,
		makeParticles: function(num) {
			for (var i = 0; i <= num; i++) {
				particleAlphabet.particles.push(new particleAlphabet.Particle(particleAlphabet.W / 2 + Math.random() * 400 - 200, particleAlphabet.H / 2 + Math.random() * 400 -200));
			}
		},
		animateParticles: function() {
			/*console.log("imgdata", particleAlphabet.ImageDataDump);
			return;*/
			if (!particleAlphabet.ImageDataDump || ("undefined" === particleAlphabet.ImageDataDump.length)){
				return;
			}
			var p, pPos, ctx;
				ctx=particleAlphabet.ctx;
			for (var i = 0, num = particleAlphabet.particles.length; i < num; i++) {
				p = particleAlphabet.particles[i];
				pPos = particleAlphabet.ImageDataDump[particleAlphabet.frameCtr][i];
				if (particleAlphabet.particles.indexOf(p) === particleAlphabet.ImageDataDump[particleAlphabet.frameCtr].indexOf(pPos)) {
					p.x=pPos.x;
					p.y=pPos.y;
					p.draw(ctx);
				}
			}
			particleAlphabet.frameCtr++;
			if (particleAlphabet.frameCtr >= particleAlphabet.ImageDataDump.length){
				if (particleAlphabet.loop){
					particleAlphabet.frameCtr=0;
				} else {
					window.cancelAnimationFrame(particleAlphabet.animationFrameId);
				}
			}
		},
		animate: function() {
			
			var fps = 10;
			  setTimeout(function() {
				particleAlphabet.animationFrameId = requestAnimationFrame(particleAlphabet.animate);
				particleAlphabet.ctx.clearRect(0, 0, particleAlphabet.W, particleAlphabet.H);
				particleAlphabet.animateParticles();
			  }, 1000 / fps);
			
		}
	};
	window.onload = particleAlphabet.init;