import { expect } from '~/tests';

import { Goal, Always, Never } from './goal';
import * as sinon from 'sinon';

describe('Goal', function () {
	describe('Building a goal', () => {
		it('infers the goal test function if the goal returns a boolean', () => {
			// state is always true
			const myGoal = Goal.of({ state: () => Promise.resolve(true) });

			expect(myGoal.test(void 0, true)).to.be.true;
			expect(myGoal.test(void 0, false)).to.be.false;
		});

		it('allows to define the test function even if the goal returns a boolean', () => {
			// state is always true
			const myGoal = Goal.of({
				state: () => Promise.resolve(true),
				test: (_: unknown, s) => !s,
			});

			expect(myGoal.test(void 0, true)).to.be.false;
			expect(myGoal.test(void 0, false)).to.be.true;
		});

		it('allows to combine goals as a tuple', async () => {
			const a = Goal.of({ state: () => Promise.resolve(10), test: () => true });
			const b = Goal.of({
				state: () => Promise.resolve('Hello World'),
				test: () => true,
			});

			const c = Goal.of([a, b]);
			expect(await c.state(0)).to.deep.equal([10, 'Hello World']);
		});
	});

	describe('Seeking a goal', () => {
		it('succeeds if the goal has already been reached', async () => {
			const actionSpy = sinon.spy();
			const myGoal = Goal.action(Always, actionSpy);

			expect(await Goal.seek(myGoal, void 0)).to.be.true;
			expect(actionSpy).to.not.have.been.called;
		});

		it('fails if the goal has not been reached and there is no way to modify the state', async () => {
			type S = { count: number };
			type C = { threshold: number };

			const state: S = { count: 0 };

			// another more complex goal
			const myGoal = Goal.of({
				state: (_: C) => Promise.resolve(state),
				test: (c: C, s: S) => s.count > c.threshold,
			});

			expect(await Goal.seek(myGoal, { threshold: 5 })).to.be.false;

			// state changes
			state.count = 6;

			// Now the goal succeeds
			expect(await Goal.seek(myGoal, { threshold: 5 })).to.be.true;
		});

		it('calls the action to change the state if the goal has not been met yet', async () => {
			const actionSpy = sinon.spy();

			type S = { count: number };
			type C = { threshold: number };

			const state: S = { count: 0 };

			// another more complex goal
			const myGoal = Goal.action(
				Goal.of({
					state: (_: C) => Promise.resolve(state),
					test: (c, s) => s.count > c.threshold,
				}),
				actionSpy,
			); // the action has no effect but it should be called nonetheless

			expect(await Goal.seek(myGoal, { threshold: 5 })).to.be.false;

			// The action should be called
			expect(actionSpy).to.have.been.calledOnce;
		});

		it('succeeds if calling the action causes the goal to be met', async () => {
			type S = { count: number };
			type C = { threshold: number };

			const state: S = { count: 5 };

			// another more complex goal
			const otherGoal = Goal.of({
				state: (_: C) => Promise.resolve(state),
				test: (c, s) => s.count > c.threshold,
				action: () => {
					// Update the state
					state.count++;
					return Promise.resolve(void 0);
				},
			});

			expect(await Goal.seek(otherGoal, { threshold: 5 })).to.be.true;
			expect(state.count).to.equal(6);
		});

		it('does not try the action if before goals are not met', async () => {
			// a goal that is never met
			const myGoal = Never;

			type S = { count: number };
			type C = { threshold: number };

			const state: S = { count: 0 };

			// another more complex goal
			const actionSpy = sinon.spy();
			const otherGoal = Goal.before(
				Goal.action(
					Goal.of({
						state: (_: C) => Promise.resolve(state),
						test: (c, s) => s.count > c.threshold,
					}),
					actionSpy,
				),
				myGoal,
			);

			expect(await Goal.seek(otherGoal, { threshold: 5 })).to.be.false;
			expect(actionSpy).to.not.have.been.called;
		});

		it('only calls the action if before goals are met', async () => {
			const myGoal = Always;

			type S = { count: number };
			type C = { threshold: number };

			const state: S = { count: 0 };

			// another more complex goal
			const actionSpy = sinon.spy();
			const otherGoal = Goal.of({
				state: (_: C) => Promise.resolve(state),
				test: (c, s) => s.count > c.threshold,
				action: actionSpy,
				before: myGoal,
			});

			expect(await Goal.seek(otherGoal, { threshold: 5 })).to.be.false;
			expect(actionSpy).to.have.been.called;
		});

		it('tries to achieve before goals if the seeked goal is not met', async () => {
			const actionSpy = sinon.spy();
			const myGoal = Goal.action(Never, actionSpy);

			type S = { count: number };
			type C = { threshold: number };

			const state: S = { count: 0 };

			// another more complex goal
			const otherGoal = Goal.of({
				state: (_: C) => Promise.resolve(state),
				test: (c, s) => s.count > c.threshold,
				before: myGoal,
			});

			expect(await Goal.seek(otherGoal, { threshold: 5 })).to.be.false;
			expect(actionSpy).to.have.been.called;
		});

		it('does not seek after goals if the parent goal has already been met', async () => {
			const actionSpy = sinon.spy();
			const myGoal = Goal.action(Never, actionSpy);

			type S = { count: number };
			type C = { threshold: number };

			const state: S = { count: 6 };

			// another more complex goal
			const otherGoal = Goal.after(
				Goal.of({
					state: (_: C) => Promise.resolve(state),
					test: (c, s) => s.count > c.threshold,
				}),
				myGoal,
			);

			expect(await Goal.seek(otherGoal, { threshold: 5 })).to.be.true;
			expect(actionSpy).to.not.have.been.called;
		});

		it('does not seek after goals if the parent goal cannot be met', async () => {
			const actionSpy = sinon.spy();
			const myGoal = Goal.action(Never, actionSpy);

			type S = { count: number };
			type C = { threshold: number };

			const state: S = { count: 0 };

			// another more complex goal
			const otherGoal = Goal.of({
				state: (_: C) => Promise.resolve(state),
				test: (c, s) => s.count > c.threshold,
				action: () => Promise.resolve(false),
				after: myGoal,
			});

			expect(await Goal.seek(otherGoal, { threshold: 5 })).to.be.false;
			expect(actionSpy).to.not.have.been.called;
		});

		it('only seeks after goals if the parent goal can be met', async () => {
			const actionSpy = sinon.spy();
			const myGoal = Goal.action(Never, actionSpy);

			type S = { count: number };
			type C = { threshold: number };

			const state: S = { count: 5 };

			// another more complex goal
			const otherGoal = Goal.after(
				Goal.of({
					state: (_: C) => Promise.resolve(state),
					test: (c, s) => s.count > c.threshold,
					action: () => {
						// Update the state
						state.count++;
						return Promise.resolve(void 0);
					},
				}),
				myGoal,
			);

			// The after goals returns false so the goal still cannot be met
			expect(await Goal.seek(otherGoal, { threshold: 5 })).to.be.false;
			expect(actionSpy).to.have.been.called;
		});

		it('succeeds if after goals are able to be met', async () => {
			const actionSpy = sinon.spy();
			const myGoal = Goal.action(Always, actionSpy);

			type S = { count: number };
			type C = { threshold: number };

			const state: S = { count: 5 };

			// another more complex goal
			const otherGoal = Goal.after(
				Goal.of({
					state: (_: C) => Promise.resolve(state),
					test: (c, s) => s.count > c.threshold,
					action: () => {
						// Update the state
						state.count++;
						return Promise.resolve(void 0);
					},
				}),
				myGoal,
			);

			// The after goal has been met
			expect(await Goal.seek(otherGoal, { threshold: 5 })).to.be.true;
			expect(actionSpy).to.not.have.been.called;
		});
	});

	describe('Seeking combined goals', () => {
		it('succeds if all the goals are able to be met', async () => {
			const g = Goal.of([Always, Always, Always]);
			expect(await Goal.seek(g, 0)).to.be.true;
		});

		it('fails if any of the goals not able to be met', async () => {
			const g = Goal.of([Always, Never, Always]);
			expect(await Goal.seek(g, 0)).to.be.false;
		});
	});
});
